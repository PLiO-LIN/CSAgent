import json
import logging
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from db.engine import Session
from db import crud
from agent import loop
from provider import factory

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatMessage(BaseModel):
    session_id: str = ""
    content: str = ""
    agent_id: str = ""
    client_meta: dict = Field(default_factory=dict)


@router.websocket("/ws/chat")
async def chat_ws(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)
            msg = ChatMessage(**data)

            async with Session() as db:
                if not msg.session_id:
                    session = await crud.create_session(db, title=msg.content[:30] if msg.content else "新对话")
                    msg.session_id = session.id
                    if msg.agent_id:
                        await crud.update_session_metadata(db, msg.session_id, {"agent_id": msg.agent_id})
                    await ws.send_text(json.dumps({"type": "session", "session_id": session.id}, ensure_ascii=False))
                elif msg.agent_id:
                    await crud.update_session_metadata(db, msg.session_id, {"agent_id": msg.agent_id})

                if msg.content:
                    await crud.add_message(db, msg.session_id, "user", [
                        {
                            "type": "text",
                            "content": msg.content,
                            "metadata": {"client_meta": msg.client_meta} if msg.client_meta else None,
                        }
                    ])

                provider = factory.create()
                async for event in loop.run(db, provider, msg.session_id, agent_id=msg.agent_id):
                    await ws.send_text(json.dumps(event.to_dict(), ensure_ascii=False))

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception as e:
        logger.exception("WebSocket error")
        try:
            await ws.send_text(json.dumps({"type": "error", "text": str(e)}, ensure_ascii=False))
        except Exception:
            pass


# SSE 流式聊天接口（前端使用 EventSource / fetch）
rest_router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    session_id: str = ""
    content: str
    phone: str = ""
    agent_id: str = ""
    client_meta: dict = Field(default_factory=dict)
    stream: bool = False


@rest_router.post("/sse")
async def chat_sse(req: ChatRequest, request: Request):
    req.stream = True
    return _build_sse_response(req, request)


def _build_sse_response(req: ChatRequest, request: Request) -> StreamingResponse:
    async def gen():
        async with Session() as db:
            sid, created = await _prepare_chat_turn(db, req)
            if created:
                yield f"data: {json.dumps({'type': 'session', 'session_id': sid}, ensure_ascii=False)}\n\n"

            async for event in _run_chat_events(db, sid, req.phone, req.agent_id):
                if await request.is_disconnected():
                    logger.info("SSE client disconnected sid=%s", sid)
                    break
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@rest_router.post("")
async def chat_rest(req: ChatRequest, request: Request):
    if req.stream:
        return _build_sse_response(req, request)

    async with Session() as db:
        sid, created = await _prepare_chat_turn(db, req)
        events = []
        async for event in _run_chat_events(db, sid, req.phone, req.agent_id):
            events.append(event)

    return _build_blocking_response(sid, events, session_created=created)


async def _prepare_chat_turn(db, req: ChatRequest) -> tuple[str, bool]:
    sid = str(req.session_id or "").strip()
    created = False
    if not sid:
        session = await crud.create_session(db, title=req.content[:30])
        sid = session.id
        created = True
        if req.phone:
            await crud.update_session_metadata(db, sid, {"phone": req.phone})
        if req.agent_id:
            await crud.update_session_metadata(db, sid, {"agent_id": req.agent_id})
    elif req.phone:
        existing_phone = await crud.get_session_phone(db, sid)
        if not existing_phone:
            await crud.update_session_metadata(db, sid, {"phone": req.phone})
    if req.agent_id:
        await crud.update_session_metadata(db, sid, {"agent_id": req.agent_id})

    await crud.add_message(db, sid, "user", [
        {
            "type": "text",
            "content": req.content,
            "metadata": {"client_meta": req.client_meta} if req.client_meta else None,
        }
    ])
    return sid, created


async def _run_chat_events(db, sid: str, phone: str, agent_id: str):
    provider = factory.create()
    async for event in loop.run(db, provider, sid, phone=phone, agent_id=agent_id):
        yield event.to_dict()


def _build_blocking_response(session_id: str, events: list[dict], session_created: bool = False) -> dict:
    reply = {
        "text": "",
        "thinking": "",
        "cards": [],
        "tool_calls": [],
        "tool_results": [],
        "status_messages": [],
        "summary_messages": [],
        "errors": [],
        "done": False,
        "max_steps_reached": False,
        "finish_reason": "unknown",
    }

    for event in events:
        event_type = str(event.get("type", "") or "").strip()
        if event_type == "thinking_delta":
            reply["thinking"] += str(event.get("content", "") or "")
        elif event_type == "text_delta":
            reply["text"] += str(event.get("content", "") or "")
        elif event_type == "card":
            reply["cards"].append(
                {
                    "card_id": str(event.get("card_id", "") or "").strip(),
                    "tool_call_id": str(event.get("tool_call_id", "") or "").strip(),
                    "card": event.get("card") if isinstance(event.get("card"), dict) else {},
                }
            )
        elif event_type == "tool_call":
            tool = event.get("tool") if isinstance(event.get("tool"), dict) else {}
            reply["tool_calls"].append(tool)
        elif event_type == "tool_result":
            reply["tool_results"].append(
                {
                    "tool": str(event.get("tool", "") or "").strip(),
                    "tool_call_id": str(event.get("tool_call_id", "") or "").strip(),
                    "text": str(event.get("text", "") or ""),
                    "error": bool(event.get("error")),
                }
            )
        elif event_type == "status":
            reply["status_messages"].append(str(event.get("text", "") or ""))
        elif event_type == "summary":
            reply["summary_messages"].append(str(event.get("text", "") or ""))
        elif event_type == "error":
            reply["errors"].append(str(event.get("text", "") or ""))
        elif event_type == "max_steps":
            reply["max_steps_reached"] = True
        elif event_type == "done":
            reply["done"] = True

    if reply["errors"]:
        reply["finish_reason"] = "error"
    elif reply["max_steps_reached"]:
        reply["finish_reason"] = "max_steps"
    elif reply["done"]:
        reply["finish_reason"] = "done"

    return {
        "session_id": session_id,
        "session_created": bool(session_created),
        "mode": "blocking",
        "reply": reply,
        "events": events,
    }
