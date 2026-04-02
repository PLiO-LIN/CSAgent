from __future__ import annotations

import json
from typing import Any

from fastapi.responses import StreamingResponse

from app.plugins.manifest import discover_plugins, discover_skills
from app.runtime import store


_EMPTY_REPLY = {
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


def _assistant_text(content: str) -> str:
    plugins = discover_plugins()
    skills = discover_skills()
    plugin_ids = ", ".join(plugin.plugin_id for plugin in plugins) if plugins else "无"
    skill_names = ", ".join(skill.name for skill in skills) if skills else "无"
    lowered = str(content or "").strip().lower()
    if "插件" in content or "plugin" in lowered:
        return (
            "当前运行在 CSAgent 的 native_core 初版骨架中。"
            f"已发现插件: {plugin_ids}。"
            f"已发现技能: {skill_names}。"
            "后续你可以把现有 telecom-agent 的 Tool、Card、Skill 逐步迁到 plugins 目录下。"
        )
    return (
        "当前运行在 CSAgent 的 native_core 初版骨架中。"
        "这个模式已经具备会话、聊天接口、插件扫描和前端卡片承载的最小落点。"
        f"当前共发现 {len(plugins)} 个插件、{len(skills)} 个技能。"
        "如需直接复用旧版能力，请把 app.mode 切回 legacy_bridge。"
    )


def _prepare_turn(payload: dict[str, Any]) -> tuple[str, bool]:
    content = str(payload.get("content", "") or "")
    sid = str(payload.get("session_id", "") or "").strip()
    created = False
    if not sid:
        session = store.create_session(title=content[:30])
        sid = session["id"]
        created = True
    if payload.get("phone"):
        store.update_session_metadata(sid, {"phone": str(payload.get("phone"))})
    store.add_message(sid, "user", content, parts=[{"type": "text", "content": content, "metadata": {"client_meta": payload.get("client_meta", {}) or {}}}])
    return sid, created


def _build_events(session_id: str, created: bool, text: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    if created:
        events.append({"type": "session", "session_id": session_id})
    events.append({"type": "status", "text": "当前为 CSAgent native_core 初版响应"})
    events.append({"type": "text_delta", "content": text})
    events.append({"type": "done"})
    return events


def _build_blocking_response(session_id: str, events: list[dict[str, Any]], session_created: bool) -> dict[str, Any]:
    reply = dict(_EMPTY_REPLY)
    for event in events:
        event_type = str(event.get("type", "") or "")
        if event_type == "text_delta":
            reply["text"] += str(event.get("content", "") or "")
        elif event_type == "status":
            reply["status_messages"].append(str(event.get("text", "") or ""))
        elif event_type == "error":
            reply["errors"].append(str(event.get("text", "") or ""))
        elif event_type == "done":
            reply["done"] = True
    if reply["errors"]:
        reply["finish_reason"] = "error"
    elif reply["done"]:
        reply["finish_reason"] = "done"
    return {
        "session_id": session_id,
        "session_created": bool(session_created),
        "mode": "blocking",
        "reply": reply,
        "events": events,
    }


async def chat_blocking(payload: dict[str, Any]) -> dict[str, Any]:
    sid, created = _prepare_turn(payload)
    text = _assistant_text(str(payload.get("content", "") or ""))
    store.add_message(sid, "assistant", text)
    events = _build_events(sid, created, text)
    return _build_blocking_response(sid, events, created)


def chat_stream(payload: dict[str, Any]) -> StreamingResponse:
    async def gen():
        sid, created = _prepare_turn(payload)
        text = _assistant_text(str(payload.get("content", "") or ""))
        store.add_message(sid, "assistant", text)
        for event in _build_events(sid, created, text):
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
