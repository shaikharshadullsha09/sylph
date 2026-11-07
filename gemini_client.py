import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

import personas

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")


def get_reply(persona_key, history):
    """
    persona_key: e.g. "cooking"
    history: list of dicts from database.get_messages(), oldest first,
             each with "role" ("user" or "model") and "content".
    Returns the model's reply as a string.
    """
    persona = personas.get_persona(persona_key)

    contents = [
        types.Content(role=m["role"], parts=[types.Part(text=m["content"])])
        for m in history
    ]

    response = client.models.generate_content(
        model=MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
                      system_instruction=(
                "Your name is Sylph. You are a multi-purpose assistant. "
                + persona["system_prompt"]
            ),
        ),
    )

    return response.text or "Sorry, I couldn't come up with a reply. Please try again."