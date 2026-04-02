from __future__ import annotations

import json

import httpx
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from app.config import settings


def legacy_bridge_enabled() -> bool:
    return settings.app.mode == "legacy_bridge" and settings.legacy_bridge.enabled


def _legacy_url(path: str) -> str:
    return f"{settings.legacy_bridge.base_url.rstrip('/')}{path}"


async def proxy_json(method: str, path: str, payload: dict | None = None):
    try:
        async with httpx.AsyncClient(timeout=settings.legacy_bridge.timeout_seconds) as client:
            resp = await client.request(method, _legacy_url(path), json=payload)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"legacy bridge request failed: {exc}") from exc

    body = None
    try:
        body = resp.json()
    except ValueError:
        body = {"text": resp.text}

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=body)
    return body


def proxy_sse(method: str, path: str, payload: dict | None = None) -> StreamingResponse:
    async def gen():
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(method, _legacy_url(path), json=payload) as resp:
                    resp.raise_for_status()
                    async for chunk in resp.aiter_bytes():
                        yield chunk
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text if exc.response is not None else str(exc)
            payload_text = json.dumps({"type": "error", "text": detail}, ensure_ascii=False)
            yield f"data: {payload_text}\n\n".encode("utf-8")
        except httpx.HTTPError as exc:
            payload_text = json.dumps({"type": "error", "text": f"legacy bridge request failed: {exc}"}, ensure_ascii=False)
            yield f"data: {payload_text}\n\n".encode("utf-8")

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
