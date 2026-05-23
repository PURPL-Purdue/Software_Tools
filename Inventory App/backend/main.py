from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from bson import ObjectId
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncIOMotorClient(os.getenv("MONGODB_URL"))
db = client.inventory


class Item(BaseModel):
    name: str
    quantity: int
    description: str = ""


def serialize(item) -> dict:
    return {**item, "id": str(item["_id"]), "_id": None}


@app.get("/items")
async def get_items():
    items = await db.items.find().to_list(100)
    return [serialize(i) for i in items]


@app.post("/items")
async def create_item(item: Item):
    result = await db.items.insert_one(item.model_dump())
    return {"id": str(result.inserted_id)}


@app.delete("/items/{id}")
async def delete_item(id: str):
    result = await db.items.delete_one({"_id": ObjectId(id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}
