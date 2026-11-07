import os
import re
import secrets

from flask import Flask, g, jsonify, render_template, request
from werkzeug.middleware.proxy_fix import ProxyFix

import database as db
import gemini_client as ai
import personas

# Static files live in public/ (Vercel serves that folder itself online;
# Flask serves it when you run locally).
app = Flask(__name__, static_folder="public", static_url_path="")

# Vercel sits behind a proxy; this makes Flask see the real https address.
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

MAX_MESSAGE_LENGTH = 4000
MAX_CHATS = 50
HOURLY_LIMIT = int(os.getenv("HOURLY_LIMIT", "30"))
DAILY_SITE_LIMIT = int(os.getenv("DAILY_SITE_LIMIT", "400"))

VISITOR_COOKIE = "sylph_visitor"


# ---------- who is visiting? ----------

@app.before_request
def identify_visitor():
    """Give every visitor a private random id, kept in a cookie."""
    token = request.cookies.get(VISITOR_COOKIE, "")
    if re.fullmatch(r"[0-9a-f]{32}", token):
        g.owner = token
        g.new_visitor = False
    else:
        g.owner = secrets.token_hex(16)
        g.new_visitor = True


@app.after_request
def remember_visitor(response):
    if getattr(g, "new_visitor", False):
        response.set_cookie(
            VISITOR_COOKIE,
            g.owner,
            max_age=60 * 60 * 24 * 365,
            httponly=True,
            secure=request.is_secure,
            samesite="Lax",
        )
    return response


@app.errorhandler(500)
def server_error(error):
    return jsonify({"error": "Something went wrong on our side. Please try again."}), 500


# ---------- pages and personas ----------

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/personas")
def api_personas():
    return jsonify(personas.list_personas())


# ---------- conversations ----------

@app.route("/api/conversations", methods=["GET"])
def api_list_conversations():
    return jsonify(db.get_all_conversations(g.owner))


@app.route("/api/conversations", methods=["POST"])
def api_create_conversation():
    data = request.get_json(silent=True) or {}
    persona_key = data.get("persona", personas.DEFAULT_PERSONA)
    if persona_key not in personas.PERSONAS:
        return jsonify({"error": "Unknown persona."}), 400
    if len(db.get_all_conversations(g.owner)) >= MAX_CHATS:
        return jsonify({"error": f"You have {MAX_CHATS} chats. Delete some to start a new one."}), 400
    new_id = db.create_conversation(g.owner, persona_key)
    return jsonify(db.get_conversation(new_id, g.owner)), 201


@app.route("/api/conversations/<int:conversation_id>", methods=["GET"])
def api_get_conversation(conversation_id):
    conversation = db.get_conversation(conversation_id, g.owner)
    if conversation is None:
        return jsonify({"error": "Conversation not found."}), 404
    conversation["messages"] = db.get_messages(conversation_id)
    return jsonify(conversation)


@app.route("/api/conversations/<int:conversation_id>", methods=["PATCH"])
def api_rename_conversation(conversation_id):
    if db.get_conversation(conversation_id, g.owner) is None:
        return jsonify({"error": "Conversation not found."}), 404
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Title cannot be empty."}), 400
    db.rename_conversation(conversation_id, g.owner, title)
    return jsonify(db.get_conversation(conversation_id, g.owner))


@app.route("/api/conversations/<int:conversation_id>", methods=["DELETE"])
def api_delete_conversation(conversation_id):
    if db.get_conversation(conversation_id, g.owner) is None:
        return jsonify({"error": "Conversation not found."}), 404
    db.delete_conversation(conversation_id, g.owner)
    return jsonify({"deleted": conversation_id})


# ---------- sending a message ----------

@app.route("/api/conversations/<int:conversation_id>/messages", methods=["POST"])
def api_send_message(conversation_id):
    conversation = db.get_conversation(conversation_id, g.owner)
    if conversation is None:
        return jsonify({"error": "Conversation not found."}), 404

    data = request.get_json(silent=True) or {}
    text = (data.get("content") or "").strip()
    if not text:
        return jsonify({"error": "Message cannot be empty."}), 400
    if len(text) > MAX_MESSAGE_LENGTH:
        return jsonify({"error": "Message is too long."}), 400

    # Usage limits protect the shared free Gemini quota.
    if db.user_messages_last_hour(g.owner) >= HOURLY_LIMIT:
        return jsonify({"error": "You've reached the hourly message limit. Please try again later."}), 429
    if db.user_messages_last_day_all() >= DAILY_SITE_LIMIT:
        return jsonify({"error": "SYLPH has reached its daily limit. Please come back tomorrow."}), 429

    # Ask Gemini first, using the saved history plus the new message.
    history = db.get_messages(conversation_id)
    history.append({"role": "user", "content": text})

    try:
        reply = ai.get_reply(conversation["persona"], history)
    except Exception as error:
        app.logger.error("Gemini call failed: %s", error)
        if "429" in str(error):
            message = "The AI is busy right now. Please wait a moment and try again."
        else:
            message = "Something went wrong talking to the AI. Please try again."
        return jsonify({"error": message}), 502

    # Only save once the AI call has succeeded.
    db.add_message(conversation_id, "user", text)
    db.add_message(conversation_id, "model", reply)

    # Auto-title a brand new chat from the first message.
    if conversation["title"] == "New Chat":
        db.rename_conversation(conversation_id, g.owner, text[:40])

    return jsonify({
        "reply": reply,
        "title": db.get_conversation(conversation_id, g.owner)["title"],
    })


if __name__ == "__main__":
    app.run(debug=True)