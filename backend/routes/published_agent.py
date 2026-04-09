from __future__ import annotations

import hashlib
import json
import secrets
import time
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.openapi.docs import get_swagger_ui_html
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.engine import get_db
from db.models import PlatformAgentApiKeyModel
from platform_registry import PlatformAgentRecord, get_agent_record
from routes.chat import ChatRequest, _build_blocking_response, _prepare_chat_turn, _run_chat_events

router = APIRouter(tags=["published-agent"])


class AgentApiKeyCreateRequest(BaseModel):
    name: str = ""


class PublishedAgentInvokeRequest(BaseModel):
    session_id: str = ""
    message: str
    client_meta: dict[str, Any] = Field(default_factory=dict)
    agent_variables: dict[str, Any] = Field(default_factory=dict)


def _hash_api_key(value: str) -> str:
    return hashlib.sha256(str(value or "").encode("utf-8")).hexdigest()


def _serialize_agent_api_key(model: PlatformAgentApiKeyModel) -> dict[str, Any]:
    return {
        "key_id": str(model.key_id or "").strip(),
        "agent_id": str(model.agent_id or "").strip(),
        "name": str(model.name or "").strip(),
        "key_prefix": str(model.key_prefix or "").strip(),
        "enabled": bool(model.enabled),
        "last_used_at": float(model.last_used_at or 0),
        "created_at": float(model.created_at or 0),
        "updated_at": float(model.updated_at or 0),
    }


def _normalize_agent_variable_values(values: dict[str, Any] | None) -> dict[str, str]:
    result: dict[str, str] = {}
    for key, value in dict(values or {}).items():
        name = str(key or "").strip()
        if not name:
            continue
        result[name] = str(value or "").strip()
    return result


def _get_published_agent_or_404(agent_id: str) -> PlatformAgentRecord:
    target = str(agent_id or "").strip()
    record = get_agent_record(target)
    if not record or not record.enabled or not record.published:
        raise HTTPException(status_code=404, detail="Published agent not found")
    return record


def _resolve_agent_variable_values(agent: PlatformAgentRecord, provided: dict[str, Any] | None) -> dict[str, str]:
    incoming = _normalize_agent_variable_values(provided)
    result: dict[str, str] = {}
    missing: list[str] = []
    for field in agent.agent_variables or []:
        key = str(field.key or "").strip()
        if not key:
            continue
        value = incoming.get(key, "")
        if not value:
            value = str(field.default_value or "").strip()
        if field.required and not value:
            missing.append(str(field.label or key).strip() or key)
            continue
        if value:
            result[key] = value
    if missing:
        raise HTTPException(status_code=400, detail=f"缺少必填参数: {', '.join(missing)}")
    return result


def _extract_presented_api_key(x_api_key: str | None, authorization: str | None) -> str:
    if str(x_api_key or "").strip():
        return str(x_api_key or "").strip()
    raw = str(authorization or "").strip()
    if raw.lower().startswith("bearer "):
        return raw.split(" ", 1)[1].strip()
    return ""


async def _authenticate_agent_api_key(db: AsyncSession, agent_id: str, presented_key: str) -> PlatformAgentApiKeyModel:
    token = str(presented_key or "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="缺少 API Key")
    row = await db.execute(
        select(PlatformAgentApiKeyModel).where(
            PlatformAgentApiKeyModel.agent_id == agent_id,
            PlatformAgentApiKeyModel.key_hash == _hash_api_key(token),
            PlatformAgentApiKeyModel.enabled.is_(True),
        )
    )
    model = row.scalars().first()
    if model is None:
        raise HTTPException(status_code=401, detail="API Key 无效")
    now = time.time()
    model.last_used_at = now
    model.updated_at = now
    db.add(model)
    return model


def _build_agent_api_doc_payload(request: Request, agent: PlatformAgentRecord) -> dict[str, Any]:
    encoded_agent_id = quote(agent.agent_id, safe="")
    invoke_path = f"/api/published/agents/{encoded_agent_id}/invoke"
    docs_path = f"/api/published/agents/{encoded_agent_id}/docs"
    openapi_path = f"/api/published/agents/{encoded_agent_id}/openapi.json"
    base_url = str(request.base_url).rstrip("/")
    invoke_url = f"{base_url}{invoke_path}"
    docs_url = f"{base_url}{docs_path}"
    openapi_url = f"{base_url}{openapi_path}"
    agent_variable_examples = {
        str(field.key or "").strip(): (str(field.default_value or "").strip() or f"<{str(field.label or field.key or '').strip() or field.key}>")
        for field in (agent.agent_variables or [])
        if str(field.key or "").strip()
    }
    sample_request = {
        "message": "你好，请介绍一下你能做什么。",
        "session_id": "",
        "client_meta": {},
        "agent_variables": agent_variable_examples,
    }
    curl_payload = json.dumps(sample_request, ensure_ascii=False)
    curl_example = "\n".join([
        f"curl -X POST '{invoke_url}' \\",
        "  -H 'Content-Type: application/json' \\",
        "  -H 'X-API-Key: <your-api-key>' \\",
        f"  -d '{curl_payload}'",
    ])
    return {
        "agent_id": agent.agent_id,
        "agent_name": agent.name or agent.agent_id,
        "docs_url": docs_url,
        "openapi_url": openapi_url,
        "invoke_url": invoke_url,
        "method": "POST",
        "auth": {
            "type": "apiKey",
            "header": "X-API-Key",
            "bearer_supported": True,
        },
        "required_agent_variables": [
            {
                "key": str(field.key or "").strip(),
                "label": str(field.label or field.key or "").strip() or str(field.key or "").strip(),
                "description": str(field.description or "").strip(),
                "default_value": str(field.default_value or "").strip(),
                "required": bool(field.required),
            }
            for field in (agent.agent_variables or [])
            if str(field.key or "").strip()
        ],
        "sample_request": sample_request,
        "curl_example": curl_example,
    }


def _build_published_agent_openapi(request: Request, agent: PlatformAgentRecord) -> dict[str, Any]:
    docs = _build_agent_api_doc_payload(request, agent)
    invoke_path = f"/api/published/agents/{quote(agent.agent_id, safe='')}/invoke"
    variable_keys = [str(field.key or "").strip() for field in (agent.agent_variables or []) if str(field.key or "").strip()]
    required_keys = [str(field.key or "").strip() for field in (agent.agent_variables or []) if field.required and str(field.key or "").strip()]
    return {
        "openapi": "3.1.0",
        "info": {
            "title": f"{agent.name or agent.agent_id} API",
            "version": "1.0.0",
            "description": f"已发布智能体 `{agent.agent_id}` 的调用接口文档。使用 `X-API-Key` 或 `Authorization: Bearer <key>` 鉴权。",
        },
        "servers": [{"url": str(request.base_url).rstrip("/")}],
        "paths": {
            invoke_path: {
                "post": {
                    "summary": "调用已发布智能体",
                    "description": "传入一条用户消息，返回阻塞式聚合结果。",
                    "security": [{"ApiKeyAuth": []}, {"BearerAuth": []}],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/PublishedAgentInvokeRequest"},
                                "example": docs["sample_request"],
                            }
                        },
                    },
                    "responses": {
                        "200": {
                            "description": "调用成功",
                            "content": {
                                "application/json": {
                                    "schema": {"$ref": "#/components/schemas/PublishedAgentInvokeResponse"},
                                }
                            },
                        },
                        "400": {"description": "请求参数错误或缺少必填变量"},
                        "401": {"description": "未提供或提供了无效的 API Key"},
                        "404": {"description": "智能体未发布或不存在"},
                    },
                }
            }
        },
        "components": {
            "securitySchemes": {
                "ApiKeyAuth": {
                    "type": "apiKey",
                    "in": "header",
                    "name": "X-API-Key",
                },
                "BearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                },
            },
            "schemas": {
                "PublishedAgentInvokeRequest": {
                    "type": "object",
                    "required": ["message"],
                    "properties": {
                        "session_id": {"type": "string", "title": "会话 ID", "default": ""},
                        "message": {"type": "string", "title": "用户消息"},
                        "client_meta": {
                            "type": "object",
                            "title": "客户端元数据",
                            "default": {},
                            "additionalProperties": True,
                        },
                        "agent_variables": {
                            "type": "object",
                            "title": "智能体固定变量",
                            "default": {},
                            "properties": {key: {"type": "string"} for key in variable_keys},
                            "required": required_keys,
                            "additionalProperties": True,
                        },
                    },
                },
                "PublishedAgentInvokeResponse": {
                    "type": "object",
                    "properties": {
                        "agent_id": {"type": "string"},
                        "agent_name": {"type": "string"},
                        "session_id": {"type": "string"},
                        "session_created": {"type": "boolean"},
                        "mode": {"type": "string"},
                        "reply": {"type": "object", "additionalProperties": True},
                        "events": {
                            "type": "array",
                            "items": {"type": "object", "additionalProperties": True},
                        },
                    },
                },
            },
        },
    }


@router.get("/api/platform/agents/{agent_id}/api-docs")
async def platform_agent_api_docs(agent_id: str, request: Request):
    agent = _get_published_agent_or_404(agent_id)
    return _build_agent_api_doc_payload(request, agent)


@router.get("/api/platform/agents/{agent_id}/api-keys")
async def list_agent_api_keys(agent_id: str, db: AsyncSession = Depends(get_db)):
    agent = _get_published_agent_or_404(agent_id)
    rows = await db.execute(
        select(PlatformAgentApiKeyModel)
        .where(PlatformAgentApiKeyModel.agent_id == agent.agent_id)
        .order_by(PlatformAgentApiKeyModel.created_at.desc())
    )
    return [_serialize_agent_api_key(item) for item in rows.scalars().all()]


@router.post("/api/platform/agents/{agent_id}/api-keys")
async def create_agent_api_key(agent_id: str, payload: AgentApiKeyCreateRequest, db: AsyncSession = Depends(get_db)):
    agent = _get_published_agent_or_404(agent_id)
    now = time.time()
    raw_key = f"csa_{secrets.token_urlsafe(24)}"
    model = PlatformAgentApiKeyModel(
        key_id=secrets.token_hex(12),
        agent_id=agent.agent_id,
        name=str(payload.name or "").strip() or f"{agent.name or agent.agent_id} Key",
        key_prefix=raw_key[:12],
        key_hash=_hash_api_key(raw_key),
        enabled=True,
        last_used_at=0,
        created_at=now,
        updated_at=now,
    )
    db.add(model)
    await db.commit()
    return {
        "key": raw_key,
        "record": _serialize_agent_api_key(model),
    }


@router.delete("/api/platform/agents/{agent_id}/api-keys/{key_id}")
async def delete_agent_api_key(agent_id: str, key_id: str, db: AsyncSession = Depends(get_db)):
    agent = _get_published_agent_or_404(agent_id)
    model = await db.get(PlatformAgentApiKeyModel, str(key_id or "").strip())
    if model is None or str(model.agent_id or "").strip() != agent.agent_id:
        raise HTTPException(status_code=404, detail="API Key not found")
    await db.delete(model)
    await db.commit()
    return {
        "ok": True,
        "key_id": str(model.key_id or "").strip(),
        "agent_id": agent.agent_id,
    }


@router.get("/api/published/agents/{agent_id}/openapi.json")
async def published_agent_openapi(agent_id: str, request: Request):
    agent = _get_published_agent_or_404(agent_id)
    return _build_published_agent_openapi(request, agent)


@router.get("/api/published/agents/{agent_id}/docs", include_in_schema=False)
async def published_agent_docs(agent_id: str):
    agent = _get_published_agent_or_404(agent_id)
    encoded_agent_id = quote(agent.agent_id, safe="")
    return get_swagger_ui_html(
        openapi_url=f"/api/published/agents/{encoded_agent_id}/openapi.json",
        title=f"{agent.name or agent.agent_id} API 文档",
    )


@router.post("/api/published/agents/{agent_id}/invoke")
async def invoke_published_agent(
    agent_id: str,
    payload: PublishedAgentInvokeRequest,
    db: AsyncSession = Depends(get_db),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    authorization: str | None = Header(default=None),
):
    agent = _get_published_agent_or_404(agent_id)
    presented_key = _extract_presented_api_key(x_api_key, authorization)
    await _authenticate_agent_api_key(db, agent.agent_id, presented_key)
    resolved_variables = _resolve_agent_variable_values(agent, payload.agent_variables)
    request_payload = ChatRequest(
        session_id=str(payload.session_id or "").strip(),
        content=str(payload.message or "").strip(),
        phone="",
        agent_id=agent.agent_id,
        client_meta=dict(payload.client_meta or {}),
        agent_variables=resolved_variables,
        stream=False,
    )
    session_id, created = await _prepare_chat_turn(db, request_payload)
    events: list[dict[str, Any]] = []
    async for event in _run_chat_events(db, session_id, "", agent.agent_id):
        events.append(event)
    response = _build_blocking_response(session_id, events, session_created=created)
    return {
        "agent_id": agent.agent_id,
        "agent_name": agent.name or agent.agent_id,
        **response,
    }
