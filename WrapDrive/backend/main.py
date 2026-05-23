from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from bson import ObjectId
from dotenv import load_dotenv
import os
import certifi

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncIOMotorClient(
    os.getenv("MONGODB_URL"),
    tlsCAFile=certifi.where()
)

db = client.inventory


class Item(BaseModel):
    name: str
    total_quantity: int
    storage_quantity: int
    biggie_k_quantity: int = 0
    airbreathing_quantity: int = 0
    tachyon_quantity: int = 0
    damaged_quantity: int = 0
    damaged_objects: dict = {}
    description: str = ""


def serialize(item) -> dict:
    return {**item, "id": str(item["_id"]), "_id": None}


@app.get("/items")
async def get_all_items():
    ''' Querys a list of all items'''
    items = await db.items.find().to_list(100)
    return [serialize(i) for i in items]

@app.post("/search")
async def search(item: Item):
    ''' Search for items matching the query'''
    mongo_query = {}

    for key, value in item.model_dump().items():
        if value:
            mongo_query[key] = {"$regex": value, "$options": "i"}

    items = await db.items.find(mongo_query).to_list(100)
    return [serialize(i) for i in items]

@app.post("/create_item")
async def create_item(item: Item):
    result = await db.items.insert_one(item.model_dump())
    return {"id": str(result.inserted_id)}

@app.post("/add_item")
async def add_item(item: Item):
    # TODO: Implement this function
    return

@app.put("/items/{id}")
async def update_item(id: str, item: Item):
    result = await db.items.update_one({"_id": ObjectId(id)}, {"$set": item.model_dump()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}

@app.get("/items/{id}")
async def get_item(id: str):
    item = await db.items.find_one({"_id": ObjectId(id)})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return serialize(item)

@app.delete("/items/{id}")
async def delete_item(id: str):
    result = await db.items.delete_one({"_id": ObjectId(id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}

# Loading page is main table, each row has item type, with option to add items 
# (new items purchased, added to inventory), and option to move items 
# (move from one location, i.e. storage, to another, i.e. biggie-k). We track 
# item location: storage, biggie, airbreathing, tachyon, damaged. 

# item:
# {
# location1:count,
# location2:count,
# location3(damaged):count,
# damaged_objects:
# {
    obj1: {serial:serial, location:loc, description:desc}
# }
# etc...
# }

# Interaction: 
# Select add item, drop down menu with how many to add
# Select move item, drop down menu with how many to move, followed by start
# location and end location
# If move item to damaged, new form asking for serial, location, description
# 

# TODO add serialization