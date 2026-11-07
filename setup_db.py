import os
import re

import certifi
import mysql.connector
from dotenv import load_dotenv

# Read the cloud settings, not the local .env
load_dotenv(".env.cloud", override=True)

ssl_ca = os.getenv("DB_SSL_CA", "certifi")
if ssl_ca == "certifi":
    ssl_ca = certifi.where()

db_name = os.getenv("DB_NAME", "")

config = {
    "host": os.getenv("DB_HOST"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "ssl_ca": ssl_ca,
    "connection_timeout": 15,
}

missing = [name for name in ("host", "user", "password") if not config[name]]
if not db_name:
    missing.append("DB_NAME")
if missing:
    print("Missing values in .env.cloud:", ", ".join(missing))
    raise SystemExit(1)

if not re.fullmatch(r"[A-Za-z0-9_]+", db_name):
    print("DB_NAME may only contain letters, numbers and underscores.")
    raise SystemExit(1)

print("Connecting to", config["host"], "...")
conn = mysql.connector.connect(**config)
cursor = conn.cursor()

# Create our own database instead of using a built-in one like sys or test
cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}`")
cursor.execute(f"USE `{db_name}`")

with open("schema.sql", encoding="utf-8") as f:
    statements = [s.strip() for s in f.read().split(";") if s.strip()]

for statement in statements:
    cursor.execute(statement)
conn.commit()

cursor.execute("SHOW TABLES")
print("Tables in", db_name, ":", [row[0] for row in cursor.fetchall()])

cursor.close()
conn.close()