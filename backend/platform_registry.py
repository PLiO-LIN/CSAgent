from __future__ import annotations

import logging
import time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import PlatformAgentModel, PlatformSkillModel, PlatformToolModel
from framework_profile import load_framework_profile
from runtime_scope import current_runtime_scope

logger = logging.getLogger(__name__)


class PlatformToolRecord(BaseModel):
    tool_name: str
    display_name: str = ""
    summary: str = ""
    provider_type: str = "local"
    source_ref: str = ""
    scope: str = "skill"
    enabled: bool = True
    supports_card: bool = False
    card_type: str = ""
    input_schema: dict[str, Any] = Field(default_factory=dict)
    output_schema: dict[str, Any] = Field(default_factory=dict)
    policy: dict[str, Any] = Field(default_factory=dict)
    card_binding: dict[str, Any] = Field(default_factory=dict)
    transport_config: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: float = 0
    updated_at: float = 0


class PlatformSkillRecord(BaseModel):
    skill_name: str
    display_name: str = ""
    summary: str = ""
    document_md: str = ""
    enabled: bool = True
    tool_names: list[str] = Field(default_factory=list)
    global_tool_names: list[str] = Field(default_factory=list)
    card_types: list[str] = Field(default_factory=list)
    entry_intents: list[str] = Field(default_factory=list)
    phases: list[str] = Field(default_factory=list)
    source_type: str = "registry"
    source_ref: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: float = 0
    updated_at: float = 0


class PlatformAgentRecord(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    agent_id: str
    name: str = ""
    description: str = ""
    enabled: bool = True
    published: bool = False
    is_default: bool = False
    system_core_prompt: str = ""
    persona_prompt: str = ""
    skill_guide_prompt: str = ""
    summary_prompt: str = ""
    memory_prompt: str = ""
    global_tool_names: list[str] = Field(default_factory=list)
    skill_names: list[str] = Field(default_factory=list)
    model_settings: dict[str, Any] = Field(default_factory=dict, alias="model_config")
    tool_policy_config: dict[str, Any] = Field(default_factory=dict)
    memory_config: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: float = 0
    updated_at: float = 0


class AgentRuntimeConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    agent_id: str = "default"
    name: str = "默认客服智能体"
    description: str = ""
    system_core_prompt: str = ""
    persona_prompt: str = ""
    skill_guide_prompt: str = ""
    summary_prompt: str = ""
    memory_prompt: str = ""
    global_tool_names: list[str] = Field(default_factory=list)
    skill_names: list[str] = Field(default_factory=list)
    model_settings: dict[str, Any] = Field(default_factory=dict, alias="model_config")
    tool_policy_config: dict[str, Any] = Field(default_factory=dict)
    memory_config: dict[str, Any] = Field(default_factory=dict)


_tool_cache: dict[str, PlatformToolRecord] = {}
_skill_cache: dict[str, PlatformSkillRecord] = {}
_agent_cache: dict[str, PlatformAgentRecord] = {}


def _dedupe_text_list(values: list[str] | tuple[str, ...] | set[str] | None) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def _record_from_tool_model(model: PlatformToolModel) -> PlatformToolRecord:
    return PlatformToolRecord(
        tool_name=str(model.tool_name or "").strip(),
        display_name=str(model.display_name or "").strip(),
        summary=str(model.summary or "").strip(),
        provider_type=str(model.provider_type or "local").strip() or "local",
        source_ref=str(model.source_ref or "").strip(),
        scope=str(model.scope or "skill").strip() or "skill",
        enabled=bool(model.enabled),
        supports_card=bool(model.supports_card),
        card_type=str(model.card_type or "").strip(),
        input_schema=dict(model.input_schema or {}),
        output_schema=dict(model.output_schema or {}),
        policy=dict(model.policy or {}),
        card_binding=dict(model.card_binding or {}),
        transport_config=dict(model.transport_config or {}),
        metadata=dict(model.metadata_ or {}),
        created_at=float(model.created_at or 0),
        updated_at=float(model.updated_at or 0),
    )


def _record_from_skill_model(model: PlatformSkillModel) -> PlatformSkillRecord:
    return PlatformSkillRecord(
        skill_name=str(model.skill_name or "").strip(),
        display_name=str(model.display_name or "").strip(),
        summary=str(model.summary or "").strip(),
        document_md=str(model.document_md or ""),
        enabled=bool(model.enabled),
        tool_names=_dedupe_text_list(model.tool_names or []),
        global_tool_names=_dedupe_text_list(model.global_tool_names or []),
        card_types=_dedupe_text_list(model.card_types or []),
        entry_intents=_dedupe_text_list(model.entry_intents or []),
        phases=_dedupe_text_list(model.phases or []),
        source_type=str(model.source_type or "registry").strip() or "registry",
        source_ref=str(model.source_ref or "").strip(),
        metadata=dict(model.metadata_ or {}),
        created_at=float(model.created_at or 0),
        updated_at=float(model.updated_at or 0),
    )


def _record_from_agent_model(model: PlatformAgentModel) -> PlatformAgentRecord:
    return PlatformAgentRecord(
        agent_id=str(model.agent_id or "").strip(),
        name=str(model.name or "").strip(),
        description=str(model.description or "").strip(),
        enabled=bool(model.enabled),
        published=bool(model.published),
        is_default=bool(model.is_default),
        system_core_prompt=str(model.system_core_prompt or ""),
        persona_prompt=str(model.persona_prompt or ""),
        skill_guide_prompt=str(model.skill_guide_prompt or ""),
        summary_prompt=str(model.summary_prompt or ""),
        memory_prompt=str(model.memory_prompt or ""),
        global_tool_names=_dedupe_text_list(model.global_tool_names or []),
        skill_names=_dedupe_text_list(model.skill_names or []),
        model_settings=dict(model.model_config or {}),
        tool_policy_config=dict(model.tool_policy_config or {}),
        memory_config=dict(model.memory_config or {}),
        metadata=dict(model.metadata_ or {}),
        created_at=float(model.created_at or 0),
        updated_at=float(model.updated_at or 0),
    )


def _default_global_tool_names() -> list[str]:
    return [
        item.tool_name
        for item in list_tool_records(include_disabled=False)
        if item.enabled and item.scope == "global" and item.provider_type != "mcp"
    ]


def _default_skill_names() -> list[str]:
    return [item.skill_name for item in list_skill_records(include_disabled=False, scoped=False)]


def _default_memory_config(profile: Any) -> dict[str, Any]:
    return {
        "enabled": bool(profile.long_term_memory.enabled),
        "top_k": int(profile.long_term_memory.top_k or 0),
    }


def _reconcile_default_agent_model(model: PlatformAgentModel, profile: Any, now: float) -> bool:
    changed = False

    if not str(model.name or "").strip():
        model.name = "默认客服智能体"
        changed = True
    if not str(model.description or "").strip():
        model.description = "平台默认 Agent"
        changed = True
    if not bool(model.enabled):
        model.enabled = True
        changed = True
    if not bool(model.published):
        model.published = True
        changed = True
    if not bool(model.is_default):
        model.is_default = True
        changed = True

    if not str(model.system_core_prompt or "").strip():
        model.system_core_prompt = profile.prompts.system_core
        changed = True
    if not str(model.summary_prompt or "").strip():
        model.summary_prompt = profile.prompts.compaction
        changed = True
    if not str(model.memory_prompt or "").strip():
        model.memory_prompt = profile.long_term_memory.prompt
        changed = True

    skill_guide_prompt = str(model.skill_guide_prompt or "")
    if not skill_guide_prompt.strip() or "list_skills" in skill_guide_prompt:
        model.skill_guide_prompt = profile.prompts.skill_guide
        changed = True

    allowed_global_tool_names = set(_default_global_tool_names())
    current_global_tool_names = _dedupe_text_list(model.global_tool_names or [])
    normalized_global_tool_names = [name for name in current_global_tool_names if name in allowed_global_tool_names]
    if not normalized_global_tool_names:
        normalized_global_tool_names = _default_global_tool_names()
    if normalized_global_tool_names != current_global_tool_names:
        model.global_tool_names = normalized_global_tool_names
        changed = True

    allowed_skill_names = set(_default_skill_names())
    current_skill_names = _dedupe_text_list(model.skill_names or [])
    normalized_skill_names = [name for name in current_skill_names if name in allowed_skill_names]
    if normalized_skill_names != current_skill_names:
        model.skill_names = normalized_skill_names
        changed = True

    memory_config = dict(model.memory_config or {})
    normalized_memory_config = _default_memory_config(profile)
    if not isinstance(memory_config.get("enabled"), bool):
        memory_config["enabled"] = normalized_memory_config["enabled"]
    if not isinstance(memory_config.get("top_k"), int):
        memory_config["top_k"] = normalized_memory_config["top_k"]
    if memory_config != dict(model.memory_config or {}):
        model.memory_config = memory_config
        changed = True

    metadata = dict(model.metadata_ or {})
    if metadata.get("managed_by") != "platform_default_agent":
        metadata["managed_by"] = "platform_default_agent"
        model.metadata_ = metadata
        changed = True

    if changed:
        model.updated_at = now
    return changed


async def refresh_registry_cache(db: AsyncSession) -> None:
    tool_rows = await db.execute(select(PlatformToolModel))
    skill_rows = await db.execute(select(PlatformSkillModel))
    agent_rows = await db.execute(select(PlatformAgentModel))
    _tool_cache.clear()
    _skill_cache.clear()
    _agent_cache.clear()
    for row in tool_rows.scalars().all():
        record = _record_from_tool_model(row)
        _tool_cache[record.tool_name] = record
    for row in skill_rows.scalars().all():
        record = _record_from_skill_model(row)
        _skill_cache[record.skill_name] = record
    for row in agent_rows.scalars().all():
        record = _record_from_agent_model(row)
        _agent_cache[record.agent_id] = record


async def bootstrap_platform_registry(db: AsyncSession) -> None:
    await sync_local_tools_into_registry(db)
    await remove_seed_skills_from_registry(db)
    await sync_mcp_tools_into_registry(db, force=False)
    await ensure_default_agent(db)
    await refresh_registry_cache(db)


async def sync_local_tools_into_registry(db: AsyncSession) -> list[PlatformToolRecord]:
    from tool.registry import all_tools as runtime_all_tools

    now = time.time()
    synced_names: list[str] = []
    for entry in runtime_all_tools().values():
        if str(getattr(entry, "source", "") or "").strip().lower().startswith("mcp:"):
            continue
        model = await db.get(PlatformToolModel, entry.name)
        if model is None:
            model = PlatformToolModel(tool_name=entry.name, created_at=now)
        model.display_name = entry.name
        model.summary = str(getattr(entry, "description", "") or "")
        model.provider_type = "local"
        model.source_ref = str(getattr(entry, "source", "local") or "local")
        model.scope = str(getattr(entry, "scope", "skill") or "skill")
        model.enabled = True
        model.supports_card = bool(model.supports_card or model.card_binding or model.card_type)
        model.input_schema = dict(getattr(entry, "parameters", {}) or {})
        model.policy = dict(entry.policy_snapshot() if getattr(entry, "policy_snapshot", None) else {})
        if model.card_binding is None:
            model.card_binding = {"mode": "tool_metadata"} if model.supports_card else {}
        if model.output_schema is None:
            model.output_schema = {}
        if model.transport_config is None:
            model.transport_config = {}
        meta = dict(model.metadata_ or {})
        meta["managed_by"] = "local_registry"
        model.metadata_ = meta
        model.updated_at = now
        db.add(model)
        synced_names.append(entry.name)
    rows = await db.execute(select(PlatformToolModel).where(PlatformToolModel.provider_type == "local"))
    for model in rows.scalars().all():
        meta = dict(model.metadata_ or {})
        managed_by = str(meta.get("managed_by", "") or "").strip()
        source_ref = str(model.source_ref or "").strip()
        if model.tool_name in synced_names:
            continue
        if managed_by == "local_registry" or source_ref == "local":
            await db.delete(model)
    await db.commit()
    await refresh_registry_cache(db)
    return [record for record in list_tool_records(include_disabled=True) if record.tool_name in set(synced_names)]


async def sync_mcp_tools_into_registry(db: AsyncSession, force: bool = True) -> list[PlatformToolRecord]:
    from mcp_runtime import ensure_mcp_tools_loaded
    from tool.registry import all_tools as runtime_all_tools

    await ensure_mcp_tools_loaded(force=force)
    now = time.time()
    synced_names: list[str] = []
    for entry in runtime_all_tools().values():
        source_ref = str(getattr(entry, "source", "") or "").strip()
        if not source_ref.lower().startswith("mcp:"):
            continue
        model = await db.get(PlatformToolModel, entry.name)
        if model is None:
            model = PlatformToolModel(tool_name=entry.name, created_at=now)
        model.display_name = entry.name
        model.summary = str(getattr(entry, "description", "") or "")
        model.provider_type = "mcp"
        model.source_ref = source_ref
        model.scope = str(getattr(entry, "scope", "global") or "global")
        model.enabled = True
        model.supports_card = False
        model.card_type = ""
        model.input_schema = dict(getattr(entry, "parameters", {}) or {})
        model.output_schema = {}
        model.policy = dict(entry.policy_snapshot() if getattr(entry, "policy_snapshot", None) else {})
        model.card_binding = {}
        model.transport_config = {"server": source_ref.split(":", 1)[1] if ":" in source_ref else source_ref}
        existing_meta = dict(model.metadata_ or {})
        existing_meta["ingested_from"] = "mcp_runtime"
        model.metadata_ = existing_meta
        model.updated_at = now
        db.add(model)
        synced_names.append(entry.name)
    rows = await db.execute(select(PlatformToolModel).where(PlatformToolModel.provider_type == "mcp"))
    for model in rows.scalars().all():
        if model.tool_name not in synced_names:
            await db.delete(model)
    await db.commit()
    await refresh_registry_cache(db)
    return [record for record in list_tool_records(include_disabled=True) if record.tool_name in set(synced_names)]


async def remove_seed_skills_from_registry(db: AsyncSession) -> list[str]:
    rows = await db.execute(select(PlatformSkillModel).where(PlatformSkillModel.source_type == "seed"))
    removed_names: list[str] = []
    for model in rows.scalars().all():
        removed_names.append(str(model.skill_name or "").strip())
        await db.delete(model)
    await db.commit()
    await refresh_registry_cache(db)
    return _dedupe_text_list(removed_names)


async def ensure_default_agent(db: AsyncSession) -> PlatformAgentRecord:
    await refresh_registry_cache(db)
    now = time.time()
    profile = load_framework_profile()
    existing = next((item for item in _agent_cache.values() if item.is_default), None)
    if existing:
        if existing.agent_id != "default":
            return existing
        model = await db.get(PlatformAgentModel, existing.agent_id)
        if model is not None and _reconcile_default_agent_model(model, profile, now):
            db.add(model)
            await db.commit()
            await refresh_registry_cache(db)
        return _agent_cache.get(existing.agent_id, existing)

    global_tool_names = _default_global_tool_names()
    skill_names = _default_skill_names()
    model = PlatformAgentModel(
        agent_id="default",
        name="默认客服智能体",
        description="平台默认 Agent",
        enabled=True,
        published=True,
        is_default=True,
        system_core_prompt=profile.prompts.system_core,
        persona_prompt="",
        skill_guide_prompt=profile.prompts.skill_guide,
        summary_prompt=profile.prompts.compaction,
        memory_prompt=profile.long_term_memory.prompt,
        global_tool_names=global_tool_names,
        skill_names=skill_names,
        model_config={},
        tool_policy_config={},
        memory_config=_default_memory_config(profile),
        metadata_={"managed_by": "platform_default_agent"},
        created_at=now,
        updated_at=now,
    )
    db.add(model)
    await db.commit()
    await refresh_registry_cache(db)
    return _agent_cache["default"]


async def upsert_tool_record(db: AsyncSession, payload: PlatformToolRecord) -> PlatformToolRecord:
    now = time.time()
    model = await db.get(PlatformToolModel, payload.tool_name)
    if model is None:
        model = PlatformToolModel(tool_name=payload.tool_name, created_at=now)
    model.display_name = payload.display_name or payload.tool_name
    model.summary = payload.summary
    model.provider_type = payload.provider_type or "local"
    model.source_ref = payload.source_ref
    model.scope = payload.scope or "skill"
    model.enabled = bool(payload.enabled)
    model.supports_card = bool(payload.supports_card)
    model.card_type = payload.card_type
    model.input_schema = dict(payload.input_schema or {})
    model.output_schema = dict(payload.output_schema or {})
    model.policy = dict(payload.policy or {})
    model.card_binding = dict(payload.card_binding or {})
    model.transport_config = dict(payload.transport_config or {})
    model.metadata_ = dict(payload.metadata or {})
    model.updated_at = now
    db.add(model)
    await db.commit()
    await refresh_registry_cache(db)
    return _tool_cache[payload.tool_name]


async def upsert_skill_record(db: AsyncSession, payload: PlatformSkillRecord) -> PlatformSkillRecord:
    now = time.time()
    model = await db.get(PlatformSkillModel, payload.skill_name)
    if model is None:
        model = PlatformSkillModel(skill_name=payload.skill_name, created_at=now)
    model.display_name = payload.display_name or payload.skill_name
    model.summary = payload.summary
    model.document_md = payload.document_md
    model.enabled = bool(payload.enabled)
    model.tool_names = _dedupe_text_list(payload.tool_names)
    model.global_tool_names = _dedupe_text_list(payload.global_tool_names)
    model.card_types = _dedupe_text_list(payload.card_types)
    model.entry_intents = _dedupe_text_list(payload.entry_intents)
    model.phases = _dedupe_text_list(payload.phases)
    model.source_type = payload.source_type or "registry"
    model.source_ref = payload.source_ref
    model.metadata_ = dict(payload.metadata or {})
    model.updated_at = now
    db.add(model)
    await db.commit()
    await refresh_registry_cache(db)
    return _skill_cache[payload.skill_name]


async def upsert_agent_record(db: AsyncSession, payload: PlatformAgentRecord) -> PlatformAgentRecord:
    now = time.time()
    model = await db.get(PlatformAgentModel, payload.agent_id)
    if model is None:
        model = PlatformAgentModel(agent_id=payload.agent_id, created_at=now)
    if payload.is_default:
        rows = await db.execute(select(PlatformAgentModel).where(PlatformAgentModel.agent_id != payload.agent_id))
        for other in rows.scalars().all():
            if other.is_default:
                other.is_default = False
                other.updated_at = now
                db.add(other)
    model.name = payload.name or payload.agent_id
    model.description = payload.description
    model.enabled = bool(payload.enabled)
    model.published = bool(payload.published)
    model.is_default = bool(payload.is_default)
    model.system_core_prompt = payload.system_core_prompt
    model.persona_prompt = payload.persona_prompt
    model.skill_guide_prompt = payload.skill_guide_prompt
    model.summary_prompt = payload.summary_prompt
    model.memory_prompt = payload.memory_prompt
    model.global_tool_names = _dedupe_text_list(payload.global_tool_names)
    model.skill_names = _dedupe_text_list(payload.skill_names)
    model.model_config = dict(payload.model_settings or {})
    model.tool_policy_config = dict(payload.tool_policy_config or {})
    model.memory_config = dict(payload.memory_config or {})
    model.metadata_ = dict(payload.metadata or {})
    model.updated_at = now
    db.add(model)
    await db.commit()
    await refresh_registry_cache(db)
    return _agent_cache[payload.agent_id]


async def publish_agent(db: AsyncSession, agent_id: str) -> PlatformAgentRecord | None:
    model = await db.get(PlatformAgentModel, agent_id)
    if model is None:
        return None
    model.published = True
    model.updated_at = time.time()
    db.add(model)
    await db.commit()
    await refresh_registry_cache(db)
    return _agent_cache.get(agent_id)


async def get_registry_snapshot(db: AsyncSession) -> dict[str, Any]:
    await refresh_registry_cache(db)
    return {
        "tools": [record.model_dump(by_alias=True) for record in list_tool_records(include_disabled=True)],
        "skills": [record.model_dump(by_alias=True) for record in list_skill_records(include_disabled=True, scoped=False)],
        "agents": [record.model_dump(by_alias=True) for record in list_agent_records(include_disabled=True)],
    }


def list_tool_records(include_disabled: bool = False) -> list[PlatformToolRecord]:
    records = list(_tool_cache.values())
    if not include_disabled:
        records = [record for record in records if record.enabled]
    return sorted(records, key=lambda item: item.tool_name)



def get_tool_record(tool_name: str) -> PlatformToolRecord | None:
    return _tool_cache.get(str(tool_name or "").strip())



def list_skill_records(include_disabled: bool = False, scoped: bool = True) -> list[PlatformSkillRecord]:
    records = list(_skill_cache.values())
    if not include_disabled:
        records = [record for record in records if record.enabled]
    if scoped:
        scope = current_runtime_scope()
        allowed = {name for name in scope.skill_names if name}
        if allowed:
            records = [record for record in records if record.skill_name in allowed]
    return sorted(records, key=lambda item: item.skill_name)



def get_skill_record(skill_name: str) -> PlatformSkillRecord | None:
    record = _skill_cache.get(str(skill_name or "").strip())
    if not record:
        return None
    if not record.enabled:
        return None
    scope = current_runtime_scope()
    allowed = {name for name in scope.skill_names if name}
    if allowed and record.skill_name not in allowed:
        return None
    return record



def has_registry_skills() -> bool:
    return bool(_skill_cache)



def list_agent_records(include_disabled: bool = False) -> list[PlatformAgentRecord]:
    records = list(_agent_cache.values())
    if not include_disabled:
        records = [record for record in records if record.enabled]
    return sorted(records, key=lambda item: item.agent_id)



def get_agent_record(agent_id: str = "") -> PlatformAgentRecord | None:
    target = str(agent_id or "").strip()
    if target and target in _agent_cache:
        return _agent_cache[target]
    default = next((record for record in _agent_cache.values() if record.is_default and record.enabled), None)
    if default:
        return default
    return _agent_cache.get("default")



def resolve_agent_runtime(agent_id: str = "") -> AgentRuntimeConfig:
    profile = load_framework_profile()
    agent = get_agent_record(agent_id)
    enabled_global_tool_names = [
        item.tool_name
        for item in list_tool_records(include_disabled=False)
        if item.enabled and item.scope == "global"
    ]
    enabled_skill_names = [item.skill_name for item in list_skill_records(include_disabled=False, scoped=False)]
    if not agent:
        return AgentRuntimeConfig(
            agent_id="default",
            name="默认客服智能体",
            system_core_prompt=profile.prompts.system_core,
            skill_guide_prompt=profile.prompts.skill_guide,
            summary_prompt=profile.prompts.compaction,
            memory_prompt=profile.long_term_memory.prompt,
            global_tool_names=enabled_global_tool_names,
            skill_names=enabled_skill_names,
            memory_config={"enabled": bool(profile.long_term_memory.enabled), "top_k": int(profile.long_term_memory.top_k or 0)},
        )
    allowed_global_tool_names = [name for name in _dedupe_text_list(agent.global_tool_names) if _tool_cache.get(name) and _tool_cache[name].enabled]
    allowed_skill_names = [name for name in _dedupe_text_list(agent.skill_names) if _skill_cache.get(name) and _skill_cache[name].enabled]
    if not allowed_global_tool_names:
        allowed_global_tool_names = enabled_global_tool_names
    if not allowed_skill_names and enabled_skill_names:
        allowed_skill_names = enabled_skill_names
    return AgentRuntimeConfig(
        agent_id=agent.agent_id,
        name=agent.name or agent.agent_id,
        description=agent.description,
        system_core_prompt=agent.system_core_prompt or profile.prompts.system_core,
        persona_prompt=agent.persona_prompt,
        skill_guide_prompt=agent.skill_guide_prompt or profile.prompts.skill_guide,
        summary_prompt=agent.summary_prompt or profile.prompts.compaction,
        memory_prompt=agent.memory_prompt or profile.long_term_memory.prompt,
        global_tool_names=allowed_global_tool_names,
        skill_names=allowed_skill_names,
        model_settings=dict(agent.model_settings or {}),
        tool_policy_config=dict(agent.tool_policy_config or {}),
        memory_config={
            "enabled": bool((agent.memory_config or {}).get("enabled", profile.long_term_memory.enabled)),
            "top_k": int((agent.memory_config or {}).get("top_k", profile.long_term_memory.top_k or 0)),
        },
    )



def list_visible_tool_records() -> list[PlatformToolRecord]:
    scope = current_runtime_scope()
    allowed_names = list(scope.global_tool_names)
    active_skill_names = set(scope.active_skill_names or ())
    for skill_name in active_skill_names:
        skill = _skill_cache.get(skill_name)
        if skill and skill.enabled:
            allowed_names.extend(skill.tool_names)
    if not allowed_names:
        return list_tool_records(include_disabled=False)
    visible: list[PlatformToolRecord] = []
    seen: set[str] = set()
    for tool_name in allowed_names:
        record = _tool_cache.get(tool_name)
        if not record or not record.enabled or record.tool_name in seen:
            continue
        seen.add(record.tool_name)
        visible.append(record)
    return visible



def visible_tool_names_for_agent(agent_id: str = "", active_skill_names: list[str] | None = None) -> list[str]:
    runtime = resolve_agent_runtime(agent_id)
    names = list(runtime.global_tool_names)
    for skill_name in _dedupe_text_list(active_skill_names or []):
        skill = _skill_cache.get(skill_name)
        if skill and skill.enabled:
            names.extend(skill.tool_names)
    return _dedupe_text_list(names)

