from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_mcp_config_payload, get_model_config_payload, patch_settings, settings
from db.engine import get_db
from framework_profile import load_framework_profile, patch_framework_profile
from platform_registry import get_registry_snapshot

router = APIRouter(prefix="/api/framework", tags=["framework"])


class FrameworkProfilePatchReq(BaseModel):
    prompts: dict[str, Any] | None = None
    long_term_memory: dict[str, Any] | None = None
    ui: dict[str, Any] | None = None


class ModelConfigPatchReq(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    chat_model: str | None = None
    embed_model: str | None = None
    active_vendor: str | None = None
    active_model: str | None = None
    vendors: list[dict[str, Any]] | None = None


class McpConfigPatchReq(BaseModel):
    enabled: bool | None = None
    tool_timeout_seconds: float | None = None
    servers: dict[str, Any] | None = None


@router.get("/info")
async def framework_info(db: AsyncSession = Depends(get_db)):
    snapshot = await get_registry_snapshot(db)
    return {
        "name": "CSAgent",
        "version": "0.2.0",
        "mode": "native_core",
        "mcp_enabled": settings.mcp_enabled,
        "tools": snapshot.get("tools", []),
        "skills": snapshot.get("skills", []),
        "agents": snapshot.get("agents", []),
    }


@router.get("/profile")
async def get_framework_profile():
    return load_framework_profile().model_dump()


@router.get("/model-config")
async def get_model_config():
    return get_model_config_payload()


@router.put("/model-config")
async def update_model_config(req: ModelConfigPatchReq):
    payload = req.model_dump(exclude_none=True)
    normalized: dict[str, Any] = {}
    if "api_key" in payload:
        normalized["api_key"] = payload["api_key"]
    if "base_url" in payload:
        normalized["base_url"] = payload["base_url"]
    if "chat_model" in payload:
        normalized["chat_model"] = payload["chat_model"]
    if "embed_model" in payload:
        normalized["embed_model"] = payload["embed_model"]
    if "active_vendor" in payload:
        normalized["llm_active_vendor"] = payload["active_vendor"]
    if "active_model" in payload:
        normalized["llm_active_model"] = payload["active_model"]
    if "vendors" in payload:
        normalized["llm_vendors"] = payload["vendors"]
    updated = patch_settings(normalized, preserve_blank_fields={"api_key"})
    return get_model_config_payload(updated)


@router.get("/mcp-config")
async def get_mcp_config():
    return get_mcp_config_payload()


@router.put("/mcp-config")
async def update_mcp_config(req: McpConfigPatchReq):
    payload = req.model_dump(exclude_none=True)
    normalized: dict[str, Any] = {}
    if "enabled" in payload:
        normalized["mcp_enabled"] = payload["enabled"]
    if "tool_timeout_seconds" in payload:
        normalized["mcp_tool_timeout_seconds"] = payload["tool_timeout_seconds"]
    if "servers" in payload:
        normalized["mcp_servers"] = payload["servers"]
    updated = patch_settings(normalized)
    return get_mcp_config_payload(updated)


@router.put("/profile")
async def update_framework_profile(req: FrameworkProfilePatchReq):
    profile = patch_framework_profile(req.model_dump(exclude_none=True))
    return profile.model_dump()
