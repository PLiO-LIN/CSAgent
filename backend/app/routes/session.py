from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.runtime.legacy_bridge import legacy_bridge_enabled, proxy_json
from app.runtime import store

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class CreateSessionReq(BaseModel):
    title: str = ""


@router.post("")
async def create_session(req: CreateSessionReq):
    if legacy_bridge_enabled():
        return await proxy_json("POST", "/api/sessions", req.model_dump())
    return store.create_session(req.title)


@router.get("")
async def list_sessions():
    if legacy_bridge_enabled():
        return await proxy_json("GET", "/api/sessions")
    return store.list_sessions()


@router.get("/{sid}")
async def get_session(sid: str):
    if legacy_bridge_enabled():
        return await proxy_json("GET", f"/api/sessions/{sid}")
    session = store.get_session(sid)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/{sid}/messages")
async def get_messages(sid: str):
    if legacy_bridge_enabled():
        return await proxy_json("GET", f"/api/sessions/{sid}/messages")
    session = store.get_session(sid)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return store.get_messages(sid)
