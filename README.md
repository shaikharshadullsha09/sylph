\# SYLPH \~a multibot



A multi-persona AI chatbot with saved chat history. Pick a specialist (Cooking Assistant, Study Buddy, Coding Helper or General Assistant) and the whole interface takes on that persona's colours.



\*\*Live demo:\*\* https://sylph-nu.vercel.app



!\[Start screen](docs/home.png)

!\[Chat](docs/chat.png)

!\[Dark mode](docs/dark.png)



\## Features

\- Four selectable personas, each with its own system prompt and colour theme

\- Chat history saved in MySQL, with rename, delete and search

\- Private chats per visitor (anonymous cookie, no login needed)

\- Rate limits per visitor and per site to protect the shared free API quota

\- Light and dark themes, collapsible sidebar, copy button, starter prompts

\- Replies rendered as sanitized markdown



\## Tech stack

\- \*\*Backend:\*\* Python, Flask

\- \*\*Database:\*\* MySQL (TiDB Cloud Starter online, local MySQL for development)

\- \*\*AI:\*\* Google Gemini API (`google-genai`)

\- \*\*Frontend:\*\* HTML, CSS and vanilla JavaScript

\- \*\*Hosting:\*\* Vercel



\## How it works

The browser calls a small REST API (`/api/conversations`, `/api/conversations/<id>/messages`, and so on). Each message request loads the saved history from MySQL, sends it with the persona's system prompt to Gemini, and stores both sides of the exchange only after the reply succeeds. Every query is scoped to the visitor's private ID, so visitors can't see each other's chats.



\## Run it locally

1\. Clone the repo and create a virtual environment: `python -m venv venv`

2\. Activate it and install packages: `pip install -r requirements.txt`

3\. Create a MySQL database and run `schema.sql` in it

4\. Copy `.env.example` to `.env` and fill in your values. For a local MySQL server, use `DB\_HOST=localhost`, `DB\_PORT=3306`, your MySQL user, password and database name, and delete the `DB\_SSL\_CA` line.

5\. Start the app with `python app.py` and open http://127.0.0.1:5000



\## Notes

\- Messages are sent to Google Gemini, so avoid sharing personal details.



\## Limitations and next steps

\- Visitors are identified by an anonymous cookie, so clearing cookies loses that visitor's chat history. Real user accounts would be the next step.

\- Replies appear all at once. Streaming them word by word would feel more responsive.

\- The project runs on free tiers (Gemini API, TiDB Cloud Starter, Vercel Hobby), so usage limits apply.

