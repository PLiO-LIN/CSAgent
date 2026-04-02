from __future__ import annotations

import time
import uuid
from typing import Any

_sessions: dict[str, dict[str, Any]] = {}
_messages: dict[str, list[dict[str, Any]]] = {}


def create_session(title: str = "") -> dict[str, Any]:
    sid = uuid.uuid4().hex
    session = {
        "id": sid,
        "title": title or "新对话",
        "created_at": time.time(),
        "metadata": {},
    }
    _sessions[sid] = session
    _messages[sid] = []
    return session


def list_sessions() -> list[dict[str, Any]]:
    return sorted(_sessions.values(), key=lambda item: item["created_at"], reverse=True)


def get_session(sid: str) -> dict[str, Any] | None:
    return _sessions.get(sid)


def update_session_metadata(sid: str, patch: dict[str, Any]) -> None:
    session = _sessions.get(sid)
    if not session:
        return
    meta = session.setdefault("metadata", {})
    if isinstance(meta, dict):
        meta.update(patch or {})


def add_message(sid: str, role: str, content: str, parts: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    record = {
        "id": uuid.uuid4().hex,
        "role": role,
        "agent": "csagent-native",
        "model": "native-core",
        "created_at": time.time(),
        "parts": parts if parts is not None else [{"type": "text", "content": content, "metadata": None}],
    }
    _messages.setdefault(sid, []).append(record)
    return record


def get_messages(sid: str) -> list[dict[str, Any]]:
    return list(_messages.get(sid, []))
