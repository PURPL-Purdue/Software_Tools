from pymongo import MongoClient
from pymongo.server_api import ServerApi
import certifi

uri = "mongodb+srv://purpladmin:purpladmin@wrapspeed.bywzkz0.mongodb.net/?retryWrites=true&w=majority&appName=WrapSpeed"

client = MongoClient(
    uri,
    tlsCAFile=certifi.where(),
    server_api=ServerApi('1')
)

try:
    client.admin.command('ping')
    print("Connected")
except Exception as e:
    import traceback
    traceback.print_exc()