"""Safe MongoDB connectivity test. Never hard-code credentials in source code."""
import os
import certifi
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.server_api import ServerApi

load_dotenv()
uri = os.getenv("MONGODB_URL")
if not uri:
    raise SystemExit("MONGODB_URL is missing. Copy .env.example to .env and set it there.")

client = MongoClient(uri, tlsCAFile=certifi.where(), server_api=ServerApi("1"), serverSelectionTimeoutMS=5000)
try:
    client.admin.command("ping")
    print("Connected")
finally:
    client.close()
