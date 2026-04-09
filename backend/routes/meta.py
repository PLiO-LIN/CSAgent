from __future__ import annotations

from datetime import datetime, timedelta
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import McpServerSettings, get_llm_catalog, get_mcp_config_payload, get_model_config_payload, patch_settings, resolve_llm_selection, settings
from db.engine import get_db
from db.models import LLMRequestModel
from framework_profile import load_framework_profile, patch_framework_profile
from mcp_runtime import inspect_mcp_server
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


class ModelConfigProbeReq(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    chat_model: str | None = None
    active_vendor: str | None = None
    active_model: str | None = None
    vendors: list[dict[str, Any]] | None = None


class McpConfigPatchReq(BaseModel):
    enabled: bool | None = None
    tool_timeout_seconds: float | None = None
    servers: dict[str, Any] | None = None


class McpServerProbeReq(BaseModel):
    name: str | None = None
    server: dict[str, Any] | None = None


def _create_usage_counter() -> dict[str, Any]:
    return {
        "total_calls": 0,
        "completed_calls": 0,
        "error_calls": 0,
        "pending_calls": 0,
        "total_input_tokens": 0,
        "total_output_tokens": 0,
        "total_tokens": 0,
        "input_estimated_cost": 0.0,
        "output_estimated_cost": 0.0,
        "estimated_cost": 0.0,
        "avg_latency_ms": 0,
        "success_rate": 0.0,
        "last_called_at": 0.0,
        "unique_sessions": 0,
        "_latency_total": 0,
        "_latency_count": 0,
        "_session_ids": set(),
    }


def _create_vendor_usage_entry(vendor_id: str, display_name: str = "", base_url: str = "", enabled: bool = True, configured: bool = False) -> dict[str, Any]:
    return {
        "vendor_id": vendor_id,
        "display_name": display_name or vendor_id,
        "base_url": base_url,
        "enabled": enabled,
        "configured": configured,
        "models": [],
        **_create_usage_counter(),
    }


def _create_model_usage_entry(
    model_id: str,
    display_name: str = "",
    chat_model: str = "",
    enabled: bool = True,
    configured: bool = False,
    input_cost_per_mtokens: float | None = None,
    output_cost_per_mtokens: float | None = None,
) -> dict[str, Any]:
    normalized_chat_model = str(chat_model or model_id or "").strip()
    normalized_model_id = str(model_id or normalized_chat_model or "").strip()
    return {
        "model_id": normalized_model_id,
        "display_name": display_name or normalized_model_id or normalized_chat_model,
        "chat_model": normalized_chat_model,
        "enabled": enabled,
        "configured": configured,
        "input_cost_per_mtokens": input_cost_per_mtokens,
        "output_cost_per_mtokens": output_cost_per_mtokens,
        **_create_usage_counter(),
    }


def _apply_usage_row(
    target: dict[str, Any],
    *,
    session_id: str,
    status: str,
    token_input: int,
    token_output: int,
    latency_ms: int,
    created_at: float,
    input_cost_per_mtokens: float | None = None,
    output_cost_per_mtokens: float | None = None,
) -> None:
    input_tokens = max(int(token_input or 0), 0)
    output_tokens = max(int(token_output or 0), 0)
    latency = max(int(latency_ms or 0), 0)
    normalized_status = str(status or "").strip().lower() or "started"

    target["total_calls"] += 1
    if normalized_status == "completed":
        target["completed_calls"] += 1
    elif normalized_status == "error":
        target["error_calls"] += 1
    else:
        target["pending_calls"] += 1

    target["total_input_tokens"] += input_tokens
    target["total_output_tokens"] += output_tokens
    target["total_tokens"] += input_tokens + output_tokens
    target["last_called_at"] = max(float(target.get("last_called_at") or 0.0), float(created_at or 0.0))
    if session_id:
        target["_session_ids"].add(session_id)
    if latency > 0:
        target["_latency_total"] += latency
        target["_latency_count"] += 1

    input_cost = float(input_cost_per_mtokens or 0.0)
    output_cost = float(output_cost_per_mtokens or 0.0)
    target["input_estimated_cost"] += input_tokens * input_cost / 1_000_000
    target["output_estimated_cost"] += output_tokens * output_cost / 1_000_000
    target["estimated_cost"] = target["input_estimated_cost"] + target["output_estimated_cost"]


def _finalize_usage_counter(target: dict[str, Any]) -> dict[str, Any]:
    total_calls = int(target.get("total_calls") or 0)
    latency_total = int(target.pop("_latency_total", 0) or 0)
    latency_count = int(target.pop("_latency_count", 0) or 0)
    session_ids = target.pop("_session_ids", set()) or set()
    target["unique_sessions"] = len(session_ids)
    target["avg_latency_ms"] = int(round(latency_total / latency_count)) if latency_count else 0
    target["success_rate"] = round((int(target.get("completed_calls") or 0) / total_calls) * 100, 2) if total_calls else 0.0
    target["input_estimated_cost"] = round(float(target.get("input_estimated_cost") or 0.0), 6)
    target["output_estimated_cost"] = round(float(target.get("output_estimated_cost") or 0.0), 6)
    target["estimated_cost"] = round(float(target.get("estimated_cost") or 0.0), 6)
    target["last_called_at"] = round(float(target.get("last_called_at") or 0.0), 3)
    target["total_tokens"] = int(target.get("total_input_tokens") or 0) + int(target.get("total_output_tokens") or 0)
    return target


def _date_key(value: datetime) -> str:
    return value.strftime("%Y-%m-%d")


def _date_label(value: datetime) -> str:
    return value.strftime("%m/%d")


@router.get("/usage-stats")
async def get_usage_stats(db: AsyncSession = Depends(get_db)):
    vendors, _, _ = get_llm_catalog()

    vendor_entries: list[dict[str, Any]] = []
    vendor_lookup: dict[str, dict[str, Any]] = {}
    model_lookup: dict[tuple[str, str], dict[str, Any]] = {}

    for vendor in vendors:
        vendor_entry = _create_vendor_usage_entry(
            vendor_id=str(vendor.vendor_id or "").strip(),
            display_name=str(vendor.display_name or "").strip(),
            base_url=str(vendor.base_url or "").strip(),
            enabled=bool(vendor.enabled),
            configured=True,
        )
        vendor_entries.append(vendor_entry)
        vendor_lookup[vendor_entry["vendor_id"]] = vendor_entry
        for model in vendor.models or []:
            model_entry = _create_model_usage_entry(
                model_id=str(model.model_id or "").strip(),
                display_name=str(model.display_name or "").strip(),
                chat_model=str(model.chat_model or model.model_id or "").strip(),
                enabled=bool(model.enabled),
                configured=True,
                input_cost_per_mtokens=model.input_cost_per_mtokens,
                output_cost_per_mtokens=model.output_cost_per_mtokens,
            )
            vendor_entry["models"].append(model_entry)
            model_key = (vendor_entry["vendor_id"], model_entry["chat_model"])
            model_lookup[model_key] = model_entry

    summary = {
        "window_days": 7,
        **_create_usage_counter(),
    }

    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    trend_days = [today - timedelta(days=index) for index in range(6, -1, -1)]
    trend_map: dict[str, dict[str, Any]] = {
        _date_key(day): {
            "date": _date_key(day),
            "label": _date_label(day),
            **_create_usage_counter(),
        }
        for day in trend_days
    }
    trend_start_ts = trend_days[0].timestamp() if trend_days else 0.0

    rows = await db.execute(
        select(
            LLMRequestModel.provider,
            LLMRequestModel.model,
            LLMRequestModel.status,
            LLMRequestModel.token_input,
            LLMRequestModel.token_output,
            LLMRequestModel.latency_ms,
            LLMRequestModel.created_at,
            LLMRequestModel.session_id,
        )
        .order_by(LLMRequestModel.created_at.asc())
    )

    for provider, model_name, status, token_input, token_output, latency_ms, created_at, session_id in rows.all():
        vendor_id = str(provider or "").strip() or "openai_compatible"
        chat_model = str(model_name or "").strip() or "unknown"
        vendor_entry = vendor_lookup.get(vendor_id)
        if vendor_entry is None:
            vendor_entry = _create_vendor_usage_entry(vendor_id=vendor_id, display_name=vendor_id, configured=False)
            vendor_lookup[vendor_id] = vendor_entry
            vendor_entries.append(vendor_entry)

        model_entry = model_lookup.get((vendor_id, chat_model))
        if model_entry is None:
            model_entry = _create_model_usage_entry(
                model_id=chat_model,
                display_name=chat_model,
                chat_model=chat_model,
                enabled=True,
                configured=False,
            )
            model_lookup[(vendor_id, chat_model)] = model_entry
            vendor_entry["models"].append(model_entry)

        apply_kwargs = {
            "session_id": str(session_id or "").strip(),
            "status": str(status or "").strip(),
            "token_input": int(token_input or 0),
            "token_output": int(token_output or 0),
            "latency_ms": int(latency_ms or 0),
            "created_at": float(created_at or 0.0),
            "input_cost_per_mtokens": model_entry.get("input_cost_per_mtokens"),
            "output_cost_per_mtokens": model_entry.get("output_cost_per_mtokens"),
        }
        _apply_usage_row(summary, **apply_kwargs)
        _apply_usage_row(vendor_entry, **apply_kwargs)
        _apply_usage_row(model_entry, **apply_kwargs)

        created_ts = float(created_at or 0.0)
        if created_ts >= trend_start_ts:
            day_key = _date_key(datetime.fromtimestamp(created_ts))
            if day_key in trend_map:
                _apply_usage_row(trend_map[day_key], **apply_kwargs)

    vendor_entries = [
        {
            **_finalize_usage_counter(vendor_entry),
            "models": [
                _finalize_usage_counter(model_entry)
                for model_entry in sorted(
                    vendor_entry["models"],
                    key=lambda item: (-int(item.get("total_calls") or 0), str(item.get("display_name") or item.get("model_id") or "")),
                )
            ],
        }
        for vendor_entry in sorted(
            vendor_entries,
            key=lambda item: (-int(item.get("total_calls") or 0), str(item.get("display_name") or item.get("vendor_id") or "")),
        )
    ]

    return {
        "generated_at": round(time.time(), 3),
        "summary": _finalize_usage_counter(summary),
        "trend": [_finalize_usage_counter(trend_map[_date_key(day)]) for day in trend_days],
        "vendors": vendor_entries,
    }


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


@router.post("/model-config/test")
async def test_model_config(req: ModelConfigProbeReq):
    payload = req.model_dump(exclude_none=True)
    resolved = resolve_llm_selection({
        "vendor_id": payload.get("active_vendor"),
        "model_id": payload.get("active_model"),
        "base_url": payload.get("base_url"),
        "chat_model": payload.get("chat_model"),
        "vendors": payload.get("vendors"),
    })
    api_key = str(payload.get("api_key") or settings.api_key or "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="请先填写 API Key")
    base_url = str(resolved.get("base_url") or "").strip()
    model = str(resolved.get("chat_model") or "").strip()
    if not base_url or not model:
        raise HTTPException(status_code=400, detail="请先选择可用的厂商和模型")

    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    started_at = time.perf_counter()
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Reply with OK only."}],
            temperature=0,
            max_tokens=8,
            stream=False,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    message = ""
    if getattr(response, "choices", None):
        first_choice = response.choices[0] if response.choices else None
        if first_choice and getattr(first_choice, "message", None):
            message = str(first_choice.message.content or "").strip()
    usage = getattr(response, "usage", None)
    usage_payload = usage.model_dump(mode="json") if usage and hasattr(usage, "model_dump") else {}
    return {
        "ok": True,
        "vendor_id": str(resolved.get("vendor_id") or ""),
        "model_id": str(resolved.get("model_id") or ""),
        "base_url": base_url,
        "chat_model": model,
        "latency_ms": elapsed_ms,
        "message": message,
        "usage": usage_payload,
    }


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


@router.post("/mcp-servers/test")
async def test_mcp_server(req: McpServerProbeReq):
    target_name = str(req.name or "probe").strip() or "probe"
    try:
        config = McpServerSettings.model_validate(req.server or {})
        return await inspect_mcp_server(target_name, config)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/profile")
async def update_framework_profile(req: FrameworkProfilePatchReq):
    profile = patch_framework_profile(req.model_dump(exclude_none=True))
    return profile.model_dump()
