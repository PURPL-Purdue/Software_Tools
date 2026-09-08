"""Part attachment upload/download endpoints backed by MongoDB GridFS."""
from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from ..config import settings
from ..db import get_db, get_fs, utcnow
from ..utils import oid, serialize_doc

router = APIRouter(prefix="/parts/{part_id}/attachments", tags=["attachments"])


@router.get("")
async def list_attachments(part_id: str):
    part_oid = oid(part_id, "part id")
    if not await get_db().parts.find_one({"_id": part_oid}):
        raise HTTPException(status_code=404, detail="Part not found")
    cursor = get_db().attachments_meta.find({"part_id": part_oid}).sort("created_at", -1)
    return [serialize_doc(d) async for d in cursor]


@router.post("", status_code=201)
async def upload_attachment(
    part_id: str,
    file: UploadFile = File(...),
    kind: str = Form("other"),
    note: str = Form(""),
    uploaded_by: str = Form("Unknown"),
):
    database = get_db()
    part_oid = oid(part_id, "part id")
    if not await database.parts.find_one({"_id": part_oid}):
        raise HTTPException(status_code=404, detail="Part not found")
    content = await file.read(settings.max_attachment_bytes + 1)
    if len(content) > settings.max_attachment_bytes:
        raise HTTPException(status_code=413, detail="Attachment exceeds configured size limit")
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    grid_id = await get_fs().upload_from_stream(
        file.filename,
        content,
        metadata={"content_type": file.content_type, "part_id": str(part_oid)},
    )
    doc = {
        "part_id": part_oid,
        "gridfs_id": grid_id,
        "filename": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": len(content),
        "kind": kind,
        "note": note,
        "uploaded_by": uploaded_by,
        "created_at": utcnow(),
    }
    result = await database.attachments_meta.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


@router.get("/{attachment_id}/download")
async def download_attachment(part_id: str, attachment_id: str):
    database = get_db()
    meta = await database.attachments_meta.find_one(
        {"_id": oid(attachment_id, "attachment id"), "part_id": oid(part_id, "part id")}
    )
    if not meta:
        raise HTTPException(status_code=404, detail="Attachment not found")
    stream = await get_fs().open_download_stream(meta["gridfs_id"])

    async def chunks():
        while True:
            chunk = await stream.readchunk()
            if not chunk:
                break
            yield chunk

    return StreamingResponse(
        chunks(),
        media_type=meta.get("content_type", "application/octet-stream"),
        headers={"Content-Disposition": f'attachment; filename="{meta["filename"]}"'},
    )


@router.delete("/{attachment_id}")
async def delete_attachment(part_id: str, attachment_id: str):
    database = get_db()
    meta = await database.attachments_meta.find_one(
        {"_id": oid(attachment_id, "attachment id"), "part_id": oid(part_id, "part id")}
    )
    if not meta:
        raise HTTPException(status_code=404, detail="Attachment not found")
    await get_fs().delete(meta["gridfs_id"])
    await database.attachments_meta.delete_one({"_id": meta["_id"]})
    return {"ok": True}
