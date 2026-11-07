import os

import mysql.connector
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    """Open a new connection using the environment (.env locally, Vercel settings online)."""
    config = {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("DB_PORT", "3306")),
        "user": os.getenv("DB_USER"),
        "password": os.getenv("DB_PASSWORD"),
        "database": os.getenv("DB_NAME"),
        "connection_timeout": 10,
    }
    # Cloud databases usually require an encrypted connection with a CA file.
       ca_file = os.getenv("DB_SSL_CA")
    if ca_file == "certifi":
        import certifi
        config["ssl_ca"] = certifi.where()
    elif ca_file:
        if not os.path.isabs(ca_file):
            ca_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ca_file)
        config["ssl_ca"] = ca_file
    return mysql.connector.connect(**config)


def run_query(query, params=(), fetch="write"):
    """
    Run one SQL query safely.
    fetch="all"   -> list of rows
    fetch="one"   -> one row or None
    fetch="write" -> commit, return the new row id
    """
    conn = get_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params)
        if fetch == "all":
            result = cursor.fetchall()
        elif fetch == "one":
            result = cursor.fetchone()
        else:
            conn.commit()
            result = cursor.lastrowid
        cursor.close()
        return result
    finally:
        conn.close()


# ---------- conversations (every query is scoped to one owner) ----------

def create_conversation(owner, persona, title="New Chat"):
    return run_query(
        "INSERT INTO conversations (owner, title, persona) VALUES (%s, %s, %s)",
        (owner, title, persona),
    )


def get_all_conversations(owner):
    return run_query(
        "SELECT id, title, persona, created_at FROM conversations "
        "WHERE owner = %s ORDER BY id DESC",
        (owner,),
        fetch="all",
    )


def get_conversation(conversation_id, owner):
    return run_query(
        "SELECT id, title, persona, created_at FROM conversations "
        "WHERE id = %s AND owner = %s",
        (conversation_id, owner),
        fetch="one",
    )


def rename_conversation(conversation_id, owner, new_title):
    new_title = new_title.strip()[:100]
    run_query(
        "UPDATE conversations SET title = %s WHERE id = %s AND owner = %s",
        (new_title, conversation_id, owner),
    )

def delete_conversation(conversation_id, owner):
    # Delete the messages explicitly, so this works even if the database
    # ignores ON DELETE CASCADE. The subquery makes sure the chat really
    # belongs to this owner.
    run_query(
        "DELETE FROM messages WHERE conversation_id IN "
        "(SELECT id FROM conversations WHERE id = %s AND owner = %s)",
        (conversation_id, owner),
    )
    run_query(
        "DELETE FROM conversations WHERE id = %s AND owner = %s",
        (conversation_id, owner),
    )


# ---------- messages ----------

def add_message(conversation_id, role, content):
    return run_query(
        "INSERT INTO messages (conversation_id, role, content) VALUES (%s, %s, %s)",
        (conversation_id, role, content),
    )


def get_messages(conversation_id):
    return run_query(
        "SELECT id, role, content, created_at FROM messages "
        "WHERE conversation_id = %s ORDER BY id ASC",
        (conversation_id,),
        fetch="all",
    )


# ---------- usage limits ----------

def user_messages_last_hour(owner):
    row = run_query(
        "SELECT COUNT(*) AS n FROM messages m "
        "JOIN conversations c ON c.id = m.conversation_id "
        "WHERE c.owner = %s AND m.role = 'user' "
        "AND m.created_at > NOW() - INTERVAL 1 HOUR",
        (owner,),
        fetch="one",
    )
    return row["n"]


def user_messages_last_day_all():
    row = run_query(
        "SELECT COUNT(*) AS n FROM messages "
        "WHERE role = 'user' AND created_at > NOW() - INTERVAL 1 DAY",
        fetch="one",
    )
    return row["n"]