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


LOCATION_FIELDS = [
    "storage_quantity",
    "biggie_k_quantity",
    "airbreathing_quantity",
    "tachyon_quantity",
    "damaged_quantity",
]


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
    categories: list[str] = []


class Category(BaseModel):
    name: str


class CategoriesChangeRequest(BaseModel):
    categories: list[str]


class MoveRequest(BaseModel):
    from_location: str
    to_location: str
    quantity: int


class AddRequest(BaseModel):
    quantity: int


class RemoveRequest(BaseModel):
    location: str
    quantity: int


class DamageRequest(BaseModel):
    serial: str
    location: str
    description: str = ""


def serialize(item) -> dict:
    cats = item.get("categories") or []
    if isinstance(cats, str):
        cats = [cats]
    legacy = item.get("category")
    if legacy and legacy not in cats:
        cats = [*cats, legacy]
    return {**item, "categories": cats, "id": str(item["_id"]), "_id": None}


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

@app.get("/categories")
async def list_categories():
    cats = await db.categories.find().sort("name", 1).to_list(200)
    return [{"id": str(c["_id"]), "name": c["name"]} for c in cats]


@app.post("/categories")
async def create_category(cat: Category):
    name = cat.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if await db.categories.find_one({"name": name}):
        raise HTTPException(status_code=400, detail="Category already exists")
    result = await db.categories.insert_one({"name": name})
    return {"id": str(result.inserted_id), "name": name}


@app.delete("/categories/{name}")
async def delete_category(name: str):
    result = await db.categories.delete_one({"name": name})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.items.update_many({"categories": name}, {"$pull": {"categories": name}})
    await db.items.update_many({"category": name}, {"$unset": {"category": ""}})
    return {"ok": True}


@app.post("/items/{id}/categories")
async def set_item_categories(id: str, req: CategoriesChangeRequest):
    deduped = list(dict.fromkeys(req.categories))
    result = await db.items.update_one(
        {"_id": ObjectId(id)},
        {"$set": {"categories": deduped}, "$unset": {"category": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


@app.post("/items/{id}/add")
async def add_to_item(id: str, req: AddRequest):
    if req.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")
    item = await db.items.find_one({"_id": ObjectId(id)})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.items.update_one(
        {"_id": ObjectId(id)},
        {"$inc": {"storage_quantity": req.quantity, "total_quantity": req.quantity}},
    )
    return {"ok": True}

@app.post("/items/{id}/remove")
async def remove_from_item(id: str, req: RemoveRequest):
    if req.location not in LOCATION_FIELDS:
        raise HTTPException(status_code=400, detail="Invalid location")
    if req.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")
    item = await db.items.find_one({"_id": ObjectId(id)})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.get(req.location, 0) < req.quantity:
        raise HTTPException(status_code=400, detail="Not enough items in that location")
    await db.items.update_one(
        {"_id": ObjectId(id)},
        {"$inc": {req.location: -req.quantity, "total_quantity": -req.quantity}},
    )
    return {"ok": True}

@app.post("/items/{id}/damage")
async def mark_damaged(id: str, req: DamageRequest):
    if req.location not in LOCATION_FIELDS or req.location == "damaged_quantity":
        raise HTTPException(status_code=400, detail="Invalid location")
    if not req.serial.strip():
        raise HTTPException(status_code=400, detail="Serial number is required")
    item = await db.items.find_one({"_id": ObjectId(id)})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if req.serial in (item.get("damaged_objects") or {}):
        raise HTTPException(status_code=400, detail="Serial number already exists")
    if item.get(req.location, 0) < 1:
        raise HTTPException(status_code=400, detail="No items available in that location")
    await db.items.update_one(
        {"_id": ObjectId(id)},
        {
            "$inc": {"damaged_quantity": 1, req.location: -1},
            "$set": {
                f"damaged_objects.{req.serial}": {
                    "serial": req.serial,
                    "location": req.location,
                    "description": req.description,
                }
            },
        },
    )
    return {"ok": True}


class DamagedMoveRequest(BaseModel):
    location: str


@app.post("/items/{id}/damaged/{serial}/move")
async def move_damaged(id: str, serial: str, req: DamagedMoveRequest):
    if req.location not in LOCATION_FIELDS or req.location == "damaged_quantity":
        raise HTTPException(status_code=400, detail="Invalid location")
    item = await db.items.find_one({"_id": ObjectId(id)})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    damaged = item.get("damaged_objects") or {}
    if serial not in damaged:
        raise HTTPException(status_code=404, detail="Damaged object not found")
    await db.items.update_one(
        {"_id": ObjectId(id)},
        {"$set": {f"damaged_objects.{serial}.location": req.location}},
    )
    return {"ok": True}


@app.post("/items/{id}/damaged/{serial}/restore")
async def restore_damaged(id: str, serial: str):
    item = await db.items.find_one({"_id": ObjectId(id)})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    damaged = item.get("damaged_objects") or {}
    if serial not in damaged:
        raise HTTPException(status_code=404, detail="Damaged object not found")
    location = damaged[serial].get("location")
    if location not in LOCATION_FIELDS or location == "damaged_quantity":
        raise HTTPException(status_code=400, detail="Damaged object has invalid location")
    await db.items.update_one(
        {"_id": ObjectId(id)},
        {
            "$inc": {"damaged_quantity": -1, location: 1},
            "$unset": {f"damaged_objects.{serial}": ""},
        },
    )
    return {"ok": True}


@app.delete("/items/{id}/damaged/{serial}")
async def delete_damaged(id: str, serial: str):
    item = await db.items.find_one({"_id": ObjectId(id)})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    damaged = item.get("damaged_objects") or {}
    if serial not in damaged:
        raise HTTPException(status_code=404, detail="Damaged object not found")
    await db.items.update_one(
        {"_id": ObjectId(id)},
        {
            "$inc": {"damaged_quantity": -1, "total_quantity": -1},
            "$unset": {f"damaged_objects.{serial}": ""},
        },
    )
    return {"ok": True}

@app.post("/items/{id}/move")
async def move_item(id: str, move: MoveRequest):
    if move.from_location not in LOCATION_FIELDS or move.to_location not in LOCATION_FIELDS:
        raise HTTPException(status_code=400, detail="Invalid location")
    if move.from_location == move.to_location:
        raise HTTPException(status_code=400, detail="Source and destination must differ")
    if move.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")

    item = await db.items.find_one({"_id": ObjectId(id)})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if item.get(move.from_location, 0) < move.quantity:
        raise HTTPException(status_code=400, detail="Not enough items in source location")

    await db.items.update_one(
        {"_id": ObjectId(id)},
        {"$inc": {move.from_location: -move.quantity, move.to_location: move.quantity}},
    )
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