from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.runtime.legacy_bridge import legacy_bridge_enabled, proxy_json, proxy_sse
from app.runtime.native_chat import chat_blocking, chat_stream

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    session_id: str = ""
    content: str
    phone: str = ""
    client_meta: dict = Field(default_factory=dict)
    stream: bool = False


@router.post("")
async def chat(req: ChatRequest, _request: Request):
    payload = req.model_dump()
    if req.stream:
        if legacy_bridge_enabled():
            return proxy_sse("POST", "/api/chat", payload)
        return chat_stream(payload)

    if legacy_bridge_enabled():
        return await proxy_json("POST", "/api/chat", payload)
    return await chat_blocking(payload)


@router.post("/sse")
async def chat_sse(req: ChatRequest, _request: Request):
    payload = req.model_dump()
    payload["stream"] = True
    if legacy_bridge_enabled():
        return proxy_sse("POST", "/api/chat/sse", payload)
    return chat_stream(payload)
