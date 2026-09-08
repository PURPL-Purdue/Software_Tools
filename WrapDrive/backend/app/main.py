"""FastAPI application entry point for the PURPL inventory backend."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

from .config import settings
from .db import connect, disconnect, get_client
from .routers.attachments import router as attachments_router
from .routers.meta import router as meta_router
from .routers.parts import router as parts_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    await connect()
    yield
    await disconnect()


app = FastAPI(
    title="PURPL Inventory API",
    version="0.2.0",
    description="Backend for part records, stock allocation/history, serialized tracking, relations, notes, and attachments.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ServerSelectionTimeoutError)
async def database_timeout(_: Request, __: ServerSelectionTimeoutError):
    return JSONResponse(status_code=503, content={"detail": "Database is unreachable"})


@app.exception_handler(ConnectionFailure)
async def database_failure(_: Request, __: ConnectionFailure):
    return JSONResponse(status_code=503, content={"detail": "Database connection failed"})


@app.get("/health", tags=["system"])
async def health():
    try:
        await get_client().admin.command("ping")
    except Exception:
        return JSONResponse(status_code=503, content={"ok": False, "database": "unavailable"})
    return {"ok": True, "database": "connected"}


app.include_router(parts_router)
app.include_router(attachments_router)
app.include_router(meta_router)
