from __future__ import annotations

import logging
import time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import PlatformAgentModel, PlatformCardCollectionModel, PlatformCardTemplateModel, PlatformSkillModel, PlatformToolModel
from framework_profile import load_framework_profile
from mcp_card_contract import extract_tool_card_binding, extract_tool_card_type, extract_tool_icons
from runtime_scope import current_runtime_scope

logger = logging.getLogger(__name__)


class CardPackSummary(BaseModel):
    pack_id: str = ""
    display_name: str = ""
    version: str = ""
    collections: int = 0
    templates: int = 0
    collection_ids: list[str] = Field(default_factory=list)
    template_ids: list[str] = Field(default_factory=list)


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


class AgentVariableField(BaseModel):
    key: str
    label: str = ""
    description: str = ""
    default_value: str = ""
    required: bool = False
    inject_to_prompt: bool = False


class AgentToolBindingField(BaseModel):
    tool_name: str
    arg_name: str
    variable_key: str


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
    agent_variables: list[AgentVariableField] = Field(default_factory=list)
    tool_arg_bindings: list[AgentToolBindingField] = Field(default_factory=list)
    model_settings: dict[str, Any] = Field(default_factory=dict, alias="model_config")
    tool_policy_config: dict[str, Any] = Field(default_factory=dict)
    memory_config: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: float = 0
    updated_at: float = 0


class PlatformCardCollectionRecord(BaseModel):
    collection_id: str
    display_name: str = ""
    summary: str = ""
    enabled: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: float = 0
    updated_at: float = 0


class PlatformCardTemplateRecord(BaseModel):
    template_id: str
    collection_id: str = "default"
    display_name: str = ""
    summary: str = ""
    enabled: bool = True
    template_type: str = "info_detail"
    renderer_key: str = ""
    data_schema: dict[str, Any] = Field(default_factory=dict)
    ui_schema: dict[str, Any] = Field(default_factory=dict)
    action_schema: dict[str, Any] = Field(default_factory=dict)
    sample_payload: dict[str, Any] = Field(default_factory=dict)
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
    agent_variables: list[AgentVariableField] = Field(default_factory=list)
    tool_arg_bindings: list[AgentToolBindingField] = Field(default_factory=list)
    model_settings: dict[str, Any] = Field(default_factory=dict, alias="model_config")
    tool_policy_config: dict[str, Any] = Field(default_factory=dict)
    memory_config: dict[str, Any] = Field(default_factory=dict)


_tool_cache: dict[str, PlatformToolRecord] = {}
_skill_cache: dict[str, PlatformSkillRecord] = {}
_agent_cache: dict[str, PlatformAgentRecord] = {}
_card_collection_cache: dict[str, PlatformCardCollectionRecord] = {}
_card_template_cache: dict[str, PlatformCardTemplateRecord] = {}


DEFAULT_CARD_COLLECTION_ID = "default"
TELECOM_CARD_COLLECTION_ID = "telecom"


DEFAULT_CARD_COLLECTIONS: tuple[PlatformCardCollectionRecord, ...] = (
    PlatformCardCollectionRecord(
        collection_id=DEFAULT_CARD_COLLECTION_ID,
        display_name="通用卡片",
        summary="放平台通用或未明确业务域的卡片模板。",
        metadata={"managed_by": "platform_default_collection"},
    ),
    PlatformCardCollectionRecord(
        collection_id=TELECOM_CARD_COLLECTION_ID,
        display_name="电信",
        summary="放电信业务域相关卡片模板。",
        metadata={"managed_by": "platform_default_collection"},
    ),
)


DEFAULT_CARD_TEMPLATES: tuple[PlatformCardTemplateRecord, ...] = (
    PlatformCardTemplateRecord(
        template_id="info_detail_default",
        display_name="信息详情卡",
        summary="适合账户信息、账单、资料详情等轻量展示场景。",
        template_type="info_detail",
        renderer_key="template::info_detail",
        data_schema={
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "summary": {"type": "string"},
                "fields": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string"},
                            "value": {},
                        },
                    },
                },
            },
        },
        ui_schema={
            "blocks": [
                {"type": "hero", "title": "$.title", "summary": "$.summary"},
                {"type": "kv_list", "path": "$.fields"},
            ],
        },
        action_schema={"actions": []},
        sample_payload={
            "title": "账户概览",
            "summary": "可用于展示基础资料、状态和字段明细。",
            "fields": [
                {"label": "账户名", "value": "张三"},
                {"label": "当前状态", "value": "正常"},
                {"label": "套餐", "value": "5G 畅享版"},
            ],
        },
        metadata={"managed_by": "platform_default_template"},
    ),
    PlatformCardTemplateRecord(
        template_id="metric_summary_default",
        display_name="指标汇总卡",
        summary="适合余额、积分、账单指标等概览型卡片。",
        template_type="metric_summary",
        renderer_key="template::metric_summary",
        data_schema={
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "summary": {"type": "string"},
                "metrics": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string"},
                            "value": {},
                            "hint": {"type": "string"},
                        },
                    },
                },
            },
        },
        ui_schema={
            "blocks": [
                {"type": "hero", "title": "$.title", "summary": "$.summary"},
                {"type": "metric_grid", "path": "$.metrics"},
            ],
        },
        action_schema={"actions": []},
        sample_payload={
            "title": "账户余额",
            "summary": "适合展示几个重要数字。",
            "metrics": [
                {"label": "余额", "value": "86.00 元", "hint": "账户可用余额"},
                {"label": "积分", "value": 2480, "hint": "可兑换积分"},
                {"label": "账单", "value": "128.50 元", "hint": "本月待缴"},
            ],
        },
        metadata={"managed_by": "platform_default_template"},
    ),
    PlatformCardTemplateRecord(
        template_id="recommendation_list_default",
        display_name="推荐列表卡",
        summary="适合推荐商品、方案列表、权益集合等场景。",
        template_type="recommendation_list",
        renderer_key="template::recommendation_list",
        data_schema={
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "summary": {"type": "string"},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "summary": {"type": "string"},
                            "badges": {"type": "array", "items": {"type": "string"}},
                        },
                    },
                },
            },
        },
        ui_schema={
            "blocks": [
                {"type": "hero", "title": "$.title", "summary": "$.summary"},
                {"type": "item_list", "path": "$.items"},
            ],
        },
        action_schema={
            "actions": [
                {"label": "继续推荐", "contentTemplate": "继续基于 {{title}} 给我推荐"},
            ],
        },
        sample_payload={
            "title": "套餐推荐",
            "summary": "适合展示若干候选项目并附带操作入口。",
            "items": [
                {"title": "5G 畅享 129", "summary": "流量更高，适合重度使用", "badges": ["129 元/月", "100GB"]},
                {"title": "轻享 79", "summary": "价格友好，适合日常沟通", "badges": ["79 元/月", "30GB"]},
            ],
        },
        metadata={"managed_by": "platform_default_template"},
    ),
)


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


def _normalize_agent_variables(values: Any) -> list[AgentVariableField]:
    result: list[AgentVariableField] = []
    seen: set[str] = set()
    if not isinstance(values, list):
        return result
    for raw in values:
        payload = raw.model_dump() if isinstance(raw, AgentVariableField) else (dict(raw) if isinstance(raw, dict) else None)
        if not payload:
            continue
        key = str(payload.get("key") or payload.get("name") or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(AgentVariableField(
            key=key,
            label=str(payload.get("label") or payload.get("display_name") or key).strip() or key,
            description=str(payload.get("description") or "").strip(),
            default_value=str(payload.get("default_value") or "").strip(),
            required=bool(payload.get("required")),
            inject_to_prompt=bool(payload.get("inject_to_prompt") or payload.get("expose_to_prompt")),
        ))
    return result


def _normalize_agent_tool_arg_bindings(values: Any, allowed_variable_keys: set[str] | None = None) -> list[AgentToolBindingField]:
    result: list[AgentToolBindingField] = []
    seen: set[tuple[str, str]] = set()
    if not isinstance(values, list):
        return result
    for raw in values:
        payload = raw.model_dump() if isinstance(raw, AgentToolBindingField) else (dict(raw) if isinstance(raw, dict) else None)
        if not payload:
            continue
        tool_name = str(payload.get("tool_name") or "").strip()
        arg_name = str(payload.get("arg_name") or payload.get("parameter") or "").strip()
        variable_key = str(payload.get("variable_key") or payload.get("variable_name") or "").strip()
        if not tool_name or not arg_name or not variable_key:
            continue
        if allowed_variable_keys is not None and variable_key not in allowed_variable_keys:
            continue
        dedupe_key = (tool_name, arg_name)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        result.append(AgentToolBindingField(tool_name=tool_name, arg_name=arg_name, variable_key=variable_key))
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


def _mcp_server_name_from_tool_record(record: PlatformToolRecord | None) -> str:
    if not record:
        return ""
    source_ref = str(record.source_ref or "").strip()
    if source_ref.lower().startswith("mcp:"):
        return source_ref.split(":", 1)[1].strip()
    transport_server = record.transport_config.get("server") if isinstance(record.transport_config, dict) else ""
    return str(transport_server or "").strip()


def _is_tool_effectively_enabled(record: PlatformToolRecord | None) -> bool:
    if not record or not record.enabled:
        return False
    if str(record.provider_type or "").strip().lower() != "mcp":
        return True
    try:
        from config import settings
    except Exception:
        return True
    if not bool(getattr(settings, "mcp_enabled", False)):
        return False
    server_name = _mcp_server_name_from_tool_record(record)
    if not server_name:
        return True
    server_config = (getattr(settings, "mcp_servers", {}) or {}).get(server_name)
    return bool(server_config and getattr(server_config, "enabled", False))


def _normalize_card_collection_id(value: str | None = "", fallback: str = DEFAULT_CARD_COLLECTION_ID) -> str:
    text = str(value or "").strip()
    return text or fallback


def _default_collection_id_for_template(template_id: str = "", metadata: dict[str, Any] | None = None) -> str:
    key = str(template_id or "").strip().lower()
    managed_by = str((metadata or {}).get("managed_by") or "").strip().lower()
    if key.startswith("telecom_") or "telecom" in managed_by:
        return TELECOM_CARD_COLLECTION_ID
    return DEFAULT_CARD_COLLECTION_ID


def _record_from_card_collection_model(model: PlatformCardCollectionModel) -> PlatformCardCollectionRecord:
    return PlatformCardCollectionRecord(
        collection_id=_normalize_card_collection_id(str(model.collection_id or "")),
        display_name=str(model.display_name or "").strip(),
        summary=str(model.summary or "").strip(),
        enabled=bool(model.enabled),
        metadata=dict(model.metadata_ or {}),
        created_at=float(model.created_at or 0),
        updated_at=float(model.updated_at or 0),
    )


def _record_from_card_template_model(model: PlatformCardTemplateModel) -> PlatformCardTemplateRecord:
    return PlatformCardTemplateRecord(
        template_id=str(model.template_id or "").strip(),
        collection_id=_normalize_card_collection_id(getattr(model, "collection_id", "") or _default_collection_id_for_template(str(model.template_id or ""), dict(model.metadata_ or {}))),
        display_name=str(model.display_name or "").strip(),
        summary=str(model.summary or "").strip(),
        enabled=bool(model.enabled),
        template_type=str(model.template_type or "info_detail").strip() or "info_detail",
        renderer_key=str(model.renderer_key or "").strip(),
        data_schema=dict(model.data_schema or {}),
        ui_schema=dict(model.ui_schema or {}),
        action_schema=dict(model.action_schema or {}),
        sample_payload=dict(model.sample_payload or {}),
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
    metadata = dict(model.metadata_ or {})
    agent_variables = _normalize_agent_variables(metadata.get("agent_variables"))
    allowed_variable_keys = {item.key for item in agent_variables}
    tool_arg_bindings = _normalize_agent_tool_arg_bindings(metadata.get("tool_arg_bindings"), allowed_variable_keys=allowed_variable_keys)
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
        agent_variables=agent_variables,
        tool_arg_bindings=tool_arg_bindings,
        model_settings=dict(model.model_config or {}),
        tool_policy_config=dict(model.tool_policy_config or {}),
        memory_config=dict(model.memory_config or {}),
        metadata=metadata,
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
    card_collection_rows = await db.execute(select(PlatformCardCollectionModel))
    card_template_rows = await db.execute(select(PlatformCardTemplateModel))
    _tool_cache.clear()
    _skill_cache.clear()
    _agent_cache.clear()
    _card_collection_cache.clear()
    _card_template_cache.clear()
    for row in tool_rows.scalars().all():
        record = _record_from_tool_model(row)
        _tool_cache[record.tool_name] = record
    for row in skill_rows.scalars().all():
        record = _record_from_skill_model(row)
        _skill_cache[record.skill_name] = record
    for row in agent_rows.scalars().all():
        record = _record_from_agent_model(row)
        _agent_cache[record.agent_id] = record
    for row in card_collection_rows.scalars().all():
        record = _record_from_card_collection_model(row)
        _card_collection_cache[record.collection_id] = record
    for row in card_template_rows.scalars().all():
        record = _record_from_card_template_model(row)
        _card_template_cache[record.template_id] = record


async def bootstrap_platform_registry(db: AsyncSession) -> None:
    await sync_local_tools_into_registry(db)
    await remove_seed_skills_from_registry(db)
    await sync_mcp_tools_into_registry(db, force=False)
    await ensure_default_agent(db)
    await ensure_default_card_collections(db)
    await ensure_default_card_templates(db)
    await scan_card_packs_directory(db)
    await reconcile_card_template_collections(db)
    await refresh_registry_cache(db)


async def ensure_default_card_collections(db: AsyncSession) -> list[PlatformCardCollectionRecord]:
    now = time.time()
    created_ids: list[str] = []
    for record in DEFAULT_CARD_COLLECTIONS:
        existing = await db.get(PlatformCardCollectionModel, record.collection_id)
        if existing is not None:
            continue
        model = PlatformCardCollectionModel(
            collection_id=record.collection_id,
            display_name=record.display_name or record.collection_id,
            summary=record.summary,
            enabled=bool(record.enabled),
            metadata_=dict(record.metadata or {}),
            created_at=now,
            updated_at=now,
        )
        db.add(model)
        created_ids.append(record.collection_id)
    if created_ids:
        await db.commit()
    await refresh_registry_cache(db)
    created_set = set(created_ids)
    return [record for record in list_card_collection_records(include_disabled=True) if record.collection_id in created_set]


async def ensure_default_card_templates(db: AsyncSession) -> list[PlatformCardTemplateRecord]:
    now = time.time()
    created_ids: list[str] = []
    for record in DEFAULT_CARD_TEMPLATES:
        existing = await db.get(PlatformCardTemplateModel, record.template_id)
        if existing is not None:
            continue
        model = PlatformCardTemplateModel(
            template_id=record.template_id,
            collection_id=_default_collection_id_for_template(record.template_id, record.metadata),
            display_name=record.display_name or record.template_id,
            summary=record.summary,
            enabled=bool(record.enabled),
            template_type=record.template_type,
            renderer_key=record.renderer_key,
            data_schema=dict(record.data_schema or {}),
            ui_schema=dict(record.ui_schema or {}),
            action_schema=dict(record.action_schema or {}),
            sample_payload=dict(record.sample_payload or {}),
            metadata_=dict(record.metadata or {}),
            created_at=now,
            updated_at=now,
        )
        db.add(model)
        created_ids.append(record.template_id)
    if created_ids:
        await db.commit()
        await refresh_registry_cache(db)
    return [record for record in list_card_template_records(include_disabled=True) if record.template_id in set(created_ids)]


async def reconcile_card_template_collections(db: AsyncSession) -> None:
    collection_rows = await db.execute(select(PlatformCardCollectionModel.collection_id))
    valid_collection_ids = {str(item or "").strip() for item in collection_rows.scalars().all() if str(item or "").strip()}
    if not valid_collection_ids:
        valid_collection_ids = {DEFAULT_CARD_COLLECTION_ID}
    now = time.time()
    changed = False
    template_rows = await db.execute(select(PlatformCardTemplateModel))
    for model in template_rows.scalars().all():
        current_collection_id = _normalize_card_collection_id(getattr(model, "collection_id", ""), fallback="")
        next_collection_id = current_collection_id if current_collection_id in valid_collection_ids else _default_collection_id_for_template(str(model.template_id or ""), dict(model.metadata_ or {}))
        if next_collection_id not in valid_collection_ids:
            next_collection_id = DEFAULT_CARD_COLLECTION_ID
        if current_collection_id == next_collection_id:
            continue
        model.collection_id = next_collection_id
        model.updated_at = now
        db.add(model)
        changed = True
    if changed:
        await db.commit()
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
        entry_meta = dict(getattr(entry, "metadata", {}) or {})
        meta.update(entry_meta)
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
    from config import settings
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
        runtime_meta = dict(getattr(entry, "metadata", {}) or {})
        protocol_meta = dict(runtime_meta.get("mcp_protocol_meta", {}) or {})
        protocol_binding = extract_tool_card_binding(protocol_meta)
        protocol_card_type = extract_tool_card_type(protocol_meta)
        protocol_icons = extract_tool_icons(protocol_meta, getattr(entry, "icons", None))
        model.display_name = str(getattr(entry, "title", "") or "").strip() or model.display_name or entry.name
        model.summary = str(getattr(entry, "description", "") or "") or model.summary or ""
        model.provider_type = "mcp"
        model.source_ref = source_ref
        model.scope = model.scope or str(getattr(entry, "scope", "global") or "global")
        model.enabled = True if model.created_at == now else model.enabled
        model.supports_card = bool(protocol_binding or model.supports_card)
        model.card_type = protocol_card_type or model.card_type or ""
        model.input_schema = dict(getattr(entry, "parameters", {}) or {})
        model.output_schema = dict(getattr(entry, "output_schema", {}) or {}) or dict(model.output_schema or {})
        model.policy = dict(entry.policy_snapshot() if getattr(entry, "policy_snapshot", None) else {})
        model.card_binding = dict(protocol_binding or model.card_binding or {})
        model.transport_config = {"server": source_ref.split(":", 1)[1] if ":" in source_ref else source_ref}
        existing_meta = dict(model.metadata_ or {})
        existing_meta["ingested_from"] = "mcp_runtime"
        existing_meta["mcp_protocol_meta"] = protocol_meta
        if protocol_icons:
            existing_meta["icons"] = protocol_icons
            existing_meta["mcp_tool_icons"] = protocol_icons
        raw_tool_name = str(runtime_meta.get("mcp_raw_tool_name", "") or "").strip()
        if raw_tool_name:
            existing_meta["mcp_raw_tool_name"] = raw_tool_name
        model.metadata_ = existing_meta
        model.updated_at = now
        db.add(model)
        synced_names.append(entry.name)
    rows = await db.execute(select(PlatformToolModel).where(PlatformToolModel.provider_type == "mcp"))
    for model in rows.scalars().all():
        if model.tool_name not in synced_names:
            server_name = str(model.source_ref or "").split(":", 1)[1].strip() if str(model.source_ref or "").lower().startswith("mcp:") else str((model.transport_config or {}).get("server") or "").strip()
            server_config = (getattr(settings, "mcp_servers", {}) or {}).get(server_name)
            if server_config is None:
                await db.delete(model)
                continue
            if not bool(getattr(settings, "mcp_enabled", False)):
                continue
            if server_config is not None and not bool(getattr(server_config, "enabled", False)):
                continue
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


async def upsert_skill_record(db: AsyncSession, payload: PlatformSkillRecord, previous_skill_name: str = "") -> PlatformSkillRecord:
    now = time.time()
    target_skill_name = str(payload.skill_name or "").strip()
    previous_key = str(previous_skill_name or "").strip() or target_skill_name
    if not target_skill_name:
        raise ValueError("skill_name is required")
    model = await db.get(PlatformSkillModel, previous_key)
    if previous_key != target_skill_name:
        conflict = await db.get(PlatformSkillModel, target_skill_name)
        if conflict is not None and conflict is not model:
            raise ValueError(f"Skill already exists: {target_skill_name}")
    if model is None:
        model = PlatformSkillModel(skill_name=target_skill_name, created_at=now)
    model.skill_name = target_skill_name
    model.display_name = payload.display_name or target_skill_name
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
    if previous_key and previous_key != target_skill_name:
        agent_rows = await db.execute(select(PlatformAgentModel))
        for agent in agent_rows.scalars().all():
            next_skill_names = _dedupe_text_list([
                target_skill_name if str(name or "").strip() == previous_key else str(name or "").strip()
                for name in (agent.skill_names or [])
            ])
            if next_skill_names != list(agent.skill_names or []):
                agent.skill_names = next_skill_names
                agent.updated_at = now
                db.add(agent)
    await db.commit()
    await refresh_registry_cache(db)
    return _skill_cache[target_skill_name]


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
    agent_variables = _normalize_agent_variables(payload.agent_variables)
    allowed_variable_keys = {item.key for item in agent_variables}
    tool_arg_bindings = _normalize_agent_tool_arg_bindings(payload.tool_arg_bindings, allowed_variable_keys=allowed_variable_keys)
    model.model_config = dict(payload.model_settings or {})
    model.tool_policy_config = dict(payload.tool_policy_config or {})
    model.memory_config = dict(payload.memory_config or {})
    metadata = dict(payload.metadata or {})
    metadata["agent_variables"] = [item.model_dump() for item in agent_variables]
    metadata["tool_arg_bindings"] = [item.model_dump() for item in tool_arg_bindings]
    model.metadata_ = metadata
    model.updated_at = now
    db.add(model)
    await db.commit()
    await refresh_registry_cache(db)
    return _agent_cache[payload.agent_id]


async def upsert_card_collection_record(db: AsyncSession, payload: PlatformCardCollectionRecord) -> PlatformCardCollectionRecord:
    now = time.time()
    collection_id = _normalize_card_collection_id(payload.collection_id)
    model = await db.get(PlatformCardCollectionModel, collection_id)
    if model is None:
        model = PlatformCardCollectionModel(collection_id=collection_id, created_at=now)
    model.display_name = payload.display_name or collection_id
    model.summary = payload.summary
    model.enabled = bool(payload.enabled)
    model.metadata_ = dict(payload.metadata or {})
    model.updated_at = now
    db.add(model)
    await db.commit()
    await refresh_registry_cache(db)
    return _card_collection_cache[collection_id]


async def upsert_card_template_record(db: AsyncSession, payload: PlatformCardTemplateRecord) -> PlatformCardTemplateRecord:
    now = time.time()
    model = await db.get(PlatformCardTemplateModel, payload.template_id)
    if model is None:
        model = PlatformCardTemplateModel(template_id=payload.template_id, created_at=now)
    collection_id = _normalize_card_collection_id(payload.collection_id, fallback=_default_collection_id_for_template(payload.template_id, payload.metadata))
    if await db.get(PlatformCardCollectionModel, collection_id) is None:
        collection_id = DEFAULT_CARD_COLLECTION_ID
    model.collection_id = collection_id
    model.display_name = payload.display_name or payload.template_id
    model.summary = payload.summary
    model.enabled = bool(payload.enabled)
    model.template_type = payload.template_type or "info_detail"
    model.renderer_key = payload.renderer_key
    model.data_schema = dict(payload.data_schema or {})
    model.ui_schema = dict(payload.ui_schema or {})
    model.action_schema = dict(payload.action_schema or {})
    model.sample_payload = dict(payload.sample_payload or {})
    model.metadata_ = dict(payload.metadata or {})
    model.updated_at = now
    db.add(model)
    await db.commit()
    await refresh_registry_cache(db)
    return _card_template_cache[payload.template_id]


async def delete_tool_record(db: AsyncSession, tool_name: str) -> bool:
    key = str(tool_name or "").strip()
    if not key:
        return False
    model = await db.get(PlatformToolModel, key)
    if model is None:
        return False
    now = time.time()
    skill_rows = await db.execute(select(PlatformSkillModel))
    for skill in skill_rows.scalars().all():
        next_tool_names = [name for name in (skill.tool_names or []) if str(name or "").strip() and str(name or "").strip() != key]
        next_global_tool_names = [name for name in (skill.global_tool_names or []) if str(name or "").strip() and str(name or "").strip() != key]
        if next_tool_names != list(skill.tool_names or []) or next_global_tool_names != list(skill.global_tool_names or []):
            skill.tool_names = next_tool_names
            skill.global_tool_names = next_global_tool_names
            skill.updated_at = now
            db.add(skill)
    agent_rows = await db.execute(select(PlatformAgentModel))
    for agent in agent_rows.scalars().all():
        next_global_tool_names = [name for name in (agent.global_tool_names or []) if str(name or "").strip() and str(name or "").strip() != key]
        if next_global_tool_names != list(agent.global_tool_names or []):
            agent.global_tool_names = next_global_tool_names
            agent.updated_at = now
            db.add(agent)
    await db.delete(model)
    await db.commit()
    await refresh_registry_cache(db)
    return True


async def delete_skill_record(db: AsyncSession, skill_name: str) -> bool:
    key = str(skill_name or "").strip()
    if not key:
        return False
    model = await db.get(PlatformSkillModel, key)
    if model is None:
        return False
    now = time.time()
    agent_rows = await db.execute(select(PlatformAgentModel))
    for agent in agent_rows.scalars().all():
        next_skill_names = [name for name in (agent.skill_names or []) if str(name or "").strip() and str(name or "").strip() != key]
        if next_skill_names != list(agent.skill_names or []):
            agent.skill_names = next_skill_names
            agent.updated_at = now
            db.add(agent)
    await db.delete(model)
    await db.commit()
    await refresh_registry_cache(db)
    return True


async def delete_card_template_record(db: AsyncSession, template_id: str) -> bool:
    key = str(template_id or "").strip()
    if not key:
        return False
    model = await db.get(PlatformCardTemplateModel, key)
    if model is None:
        return False
    now = time.time()
    tool_rows = await db.execute(select(PlatformToolModel))
    for tool in tool_rows.scalars().all():
        binding = dict(tool.card_binding or {})
        binding_template_id = str(binding.get("template_id") or binding.get("templateId") or "").strip()
        if binding_template_id != key:
            continue
        tool.card_binding = {}
        tool.updated_at = now
        db.add(tool)
    await db.delete(model)
    await db.commit()
    await refresh_registry_cache(db)
    return True


async def delete_card_collection_record(db: AsyncSession, collection_id: str) -> bool:
    key = str(collection_id or "").strip()
    if not key:
        return False
    if key == DEFAULT_CARD_COLLECTION_ID:
        raise ValueError("默认卡片集不能删除")
    model = await db.get(PlatformCardCollectionModel, key)
    if model is None:
        return False
    now = time.time()
    template_rows = await db.execute(select(PlatformCardTemplateModel).where(PlatformCardTemplateModel.collection_id == key))
    for template in template_rows.scalars().all():
        template.collection_id = DEFAULT_CARD_COLLECTION_ID
        template.updated_at = now
        db.add(template)
    await db.delete(model)
    await db.commit()
    await refresh_registry_cache(db)
    return True


async def delete_agent_record(db: AsyncSession, agent_id: str) -> bool:
    key = str(agent_id or "").strip()
    if not key:
        return False
    model = await db.get(PlatformAgentModel, key)
    if model is None:
        return False
    if bool(model.is_default):
        raise ValueError("默认智能体不能删除")
    await db.delete(model)
    await db.commit()
    await refresh_registry_cache(db)
    return True


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
        "card_collections": [record.model_dump(by_alias=True) for record in list_card_collection_records(include_disabled=True)],
        "card_templates": [record.model_dump(by_alias=True) for record in list_card_template_records(include_disabled=True)],
    }


def list_tool_records(include_disabled: bool = False) -> list[PlatformToolRecord]:
    records = list(_tool_cache.values())
    if not include_disabled:
        records = [record for record in records if _is_tool_effectively_enabled(record)]
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


def list_card_collection_records(include_disabled: bool = False) -> list[PlatformCardCollectionRecord]:
    records = list(_card_collection_cache.values())
    if not include_disabled:
        records = [record for record in records if record.enabled]
    return sorted(records, key=lambda item: item.collection_id)


def list_card_template_records(include_disabled: bool = False) -> list[PlatformCardTemplateRecord]:
    records = list(_card_template_cache.values())
    if not include_disabled:
        records = [record for record in records if record.enabled]
    return sorted(records, key=lambda item: (item.collection_id, item.template_id))


def get_card_collection_record(collection_id: str = "") -> PlatformCardCollectionRecord | None:
    return _card_collection_cache.get(str(collection_id or "").strip())


def get_card_template_record(template_id: str = "") -> PlatformCardTemplateRecord | None:
    return _card_template_cache.get(str(template_id or "").strip())



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
            agent_variables=[],
            tool_arg_bindings=[],
            memory_config={"enabled": bool(profile.long_term_memory.enabled), "top_k": int(profile.long_term_memory.top_k or 0)},
        )
    allowed_global_tool_names = [name for name in _dedupe_text_list(agent.global_tool_names) if _is_tool_effectively_enabled(_tool_cache.get(name))]
    allowed_skill_names = [name for name in _dedupe_text_list(agent.skill_names) if _skill_cache.get(name) and _skill_cache[name].enabled]
    if not allowed_global_tool_names:
        allowed_global_tool_names = enabled_global_tool_names
    if not allowed_skill_names and enabled_skill_names:
        allowed_skill_names = enabled_skill_names
    agent_variables = _normalize_agent_variables(agent.agent_variables)
    allowed_variable_keys = {item.key for item in agent_variables}
    tool_arg_bindings = _normalize_agent_tool_arg_bindings(agent.tool_arg_bindings, allowed_variable_keys=allowed_variable_keys)
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
        agent_variables=agent_variables,
        tool_arg_bindings=tool_arg_bindings,
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
        if not _is_tool_effectively_enabled(record) or (record and record.tool_name in seen):
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


# ---------------------------------------------------------------------------
# Card pack import & directory scanning
# ---------------------------------------------------------------------------

CARD_PACKS_DIR = "card_packs"


class CardPackResult(BaseModel):
    pack_id: str = ""
    display_name: str = ""
    collections_imported: int = 0
    templates_imported: int = 0
    errors: list[str] = Field(default_factory=list)


def _parse_card_pack(raw: dict[str, Any]) -> tuple[list[PlatformCardCollectionRecord], list[PlatformCardTemplateRecord], list[str]]:
    errors: list[str] = []
    collections: list[PlatformCardCollectionRecord] = []
    templates: list[PlatformCardTemplateRecord] = []
    for item in raw.get("collections") or []:
        try:
            collections.append(PlatformCardCollectionRecord(**item))
        except Exception as exc:
            errors.append(f"collection parse error: {exc}")
    for item in raw.get("templates") or []:
        try:
            templates.append(PlatformCardTemplateRecord(**item))
        except Exception as exc:
            errors.append(f"template parse error: {exc}")
    return collections, templates, errors


def _extract_card_pack_meta(metadata: dict[str, Any] | None) -> tuple[str, str, str]:
    payload = dict(metadata or {})
    pack_id = str(payload.get("card_pack_id") or "").strip()
    managed_by = str(payload.get("managed_by") or "").strip()
    if not pack_id and managed_by.lower().startswith("card_pack::"):
        pack_id = managed_by.split("::", 1)[1].strip()
    display_name = str(payload.get("card_pack_display_name") or payload.get("pack_display_name") or "").strip()
    version = str(payload.get("card_pack_version") or payload.get("version") or "").strip()
    return pack_id, display_name, version


def _decorate_card_pack_metadata(metadata: dict[str, Any] | None, pack_id: str, display_name: str = "", version: str = "") -> dict[str, Any]:
    payload = dict(metadata or {})
    if pack_id:
        payload["card_pack_id"] = pack_id
        payload.setdefault("managed_by", f"card_pack::{pack_id}")
    if display_name:
        payload["card_pack_display_name"] = display_name
    if version:
        payload["card_pack_version"] = version
    return payload


def _serialize_card_collection_for_pack(record: PlatformCardCollectionRecord) -> dict[str, Any]:
    return {
        "collection_id": record.collection_id,
        "display_name": record.display_name,
        "summary": record.summary,
        "enabled": record.enabled,
        "metadata": dict(record.metadata or {}),
    }


def _serialize_card_template_for_pack(record: PlatformCardTemplateRecord) -> dict[str, Any]:
    return {
        "template_id": record.template_id,
        "collection_id": record.collection_id,
        "display_name": record.display_name,
        "summary": record.summary,
        "enabled": record.enabled,
        "template_type": record.template_type,
        "renderer_key": record.renderer_key,
        "data_schema": dict(record.data_schema or {}),
        "ui_schema": dict(record.ui_schema or {}),
        "action_schema": dict(record.action_schema or {}),
        "sample_payload": dict(record.sample_payload or {}),
        "metadata": dict(record.metadata or {}),
    }


def list_card_pack_summaries() -> list[CardPackSummary]:
    summary_map: dict[str, CardPackSummary] = {}
    for collection in list_card_collection_records(include_disabled=True):
        pack_id, display_name, version = _extract_card_pack_meta(collection.metadata)
        if not pack_id:
            continue
        summary = summary_map.get(pack_id)
        if summary is None:
            summary = CardPackSummary(pack_id=pack_id, display_name=display_name or pack_id, version=version)
            summary_map[pack_id] = summary
        if display_name and not summary.display_name:
            summary.display_name = display_name
        if version and not summary.version:
            summary.version = version
        if collection.collection_id and collection.collection_id not in summary.collection_ids:
            summary.collection_ids.append(collection.collection_id)
    for template in list_card_template_records(include_disabled=True):
        pack_id, display_name, version = _extract_card_pack_meta(template.metadata)
        if not pack_id:
            continue
        summary = summary_map.get(pack_id)
        if summary is None:
            summary = CardPackSummary(pack_id=pack_id, display_name=display_name or pack_id, version=version)
            summary_map[pack_id] = summary
        if display_name and not summary.display_name:
            summary.display_name = display_name
        if version and not summary.version:
            summary.version = version
        if template.collection_id and template.collection_id not in summary.collection_ids:
            summary.collection_ids.append(template.collection_id)
        if template.template_id and template.template_id not in summary.template_ids:
            summary.template_ids.append(template.template_id)
    for summary in summary_map.values():
        summary.collections = len(summary.collection_ids)
        summary.templates = len(summary.template_ids)
        if not summary.display_name:
            summary.display_name = summary.pack_id
    return sorted(summary_map.values(), key=lambda item: item.pack_id)


def export_card_pack_payload(pack_id: str) -> dict[str, Any]:
    target_pack_id = str(pack_id or "").strip()
    if not target_pack_id:
        raise ValueError("卡片包 ID 不能为空")
    summaries = {item.pack_id: item for item in list_card_pack_summaries()}
    summary = summaries.get(target_pack_id)
    if summary is None:
        raise KeyError(target_pack_id)
    matched_templates = [
        item for item in list_card_template_records(include_disabled=True)
        if _extract_card_pack_meta(item.metadata)[0] == target_pack_id
    ]
    collection_ids = {item.collection_id for item in matched_templates if item.collection_id}
    for collection in list_card_collection_records(include_disabled=True):
        current_pack_id, _, _ = _extract_card_pack_meta(collection.metadata)
        if current_pack_id == target_pack_id or collection.collection_id in collection_ids:
            collection_ids.add(collection.collection_id)
    matched_collections = [
        item for item in list_card_collection_records(include_disabled=True)
        if item.collection_id in collection_ids
    ]
    return {
        "pack_id": target_pack_id,
        "display_name": summary.display_name or target_pack_id,
        "version": summary.version or "1.0",
        "_instructions": {
            "summary": "导出的卡片包可直接再次导入平台。",
            "notes": [
                "collections 与 templates 会一并导出。",
                "metadata 中会保留 card_pack_id / card_pack_display_name / card_pack_version 等来源信息。",
                "如果你要制作新卡片包，可先下载导入模板后再按说明填写。",
            ],
        },
        "collections": [_serialize_card_collection_for_pack(item) for item in matched_collections],
        "templates": [_serialize_card_template_for_pack(item) for item in matched_templates],
    }


def get_card_pack_template_payload() -> dict[str, Any]:
    example_pack_id = "your_pack_id"
    return {
        "pack_id": example_pack_id,
        "display_name": "你的卡片包名称",
        "version": "1.0",
        "_instructions": {
            "summary": "这是卡片包导入模板。保留 pack_id / display_name / version / collections / templates 这几个主字段即可。",
            "required_fields": [
                "pack_id",
                "display_name",
                "collections[].collection_id",
                "templates[].template_id",
                "templates[].collection_id",
                "templates[].template_type",
                "templates[].renderer_key",
                "templates[].ui_schema",
            ],
            "notes": [
                "collections 用来声明卡片集。",
                "templates 用来声明卡片模板；collection_id 需要指向已声明的卡片集。",
                "metadata 可自由扩展，平台会自动补充 card_pack_id 等来源信息。",
                "_instructions 字段仅用于说明，不参与导入逻辑。",
            ],
        },
        "collections": [
            {
                "collection_id": "demo_collection",
                "display_name": "演示卡片集",
                "summary": "用于展示某一业务域下的卡片模板。",
                "enabled": True,
                "metadata": {
                    "managed_by": f"card_pack::{example_pack_id}",
                    "card_pack_id": example_pack_id,
                    "card_pack_display_name": "你的卡片包名称",
                    "card_pack_version": "1.0",
                },
            },
        ],
        "templates": [
            {
                "template_id": "demo_template",
                "collection_id": "demo_collection",
                "display_name": "演示模板",
                "summary": "展示标题、标签和键值列表的基础模板。",
                "enabled": True,
                "template_type": "info_detail",
                "renderer_key": "template::info_detail",
                "data_schema": {},
                "ui_schema": {
                    "blocks": [
                        {"type": "hero", "title": "$.title", "summary": "$.summary"},
                        {"type": "badge_list", "path": "$.tags"},
                        {"type": "kv_list", "path": "$.details"},
                    ],
                },
                "action_schema": {
                    "actions": [
                        {"label": "查看详情", "contentTemplate": "请展开 {{title}} 的详细信息"},
                    ],
                },
                "sample_payload": {
                    "title": "演示卡片标题",
                    "summary": "演示卡片摘要",
                    "tags": ["模板", "说明"],
                    "details": [
                        {"label": "字段 A", "value": "值 A"},
                        {"label": "字段 B", "value": "值 B"},
                    ],
                },
                "metadata": {
                    "managed_by": f"card_pack::{example_pack_id}",
                    "card_pack_id": example_pack_id,
                    "card_pack_display_name": "你的卡片包名称",
                    "card_pack_version": "1.0",
                },
            },
        ],
    }


async def import_card_pack(db: AsyncSession, raw: dict[str, Any]) -> CardPackResult:
    pack_id = str(raw.get("pack_id") or "").strip()
    display_name = str(raw.get("display_name") or pack_id).strip()
    version = str(raw.get("version") or "").strip()
    collections, templates, parse_errors = _parse_card_pack(raw)
    result = CardPackResult(pack_id=pack_id, display_name=display_name, errors=list(parse_errors))
    for collection in collections:
        try:
            collection.metadata = _decorate_card_pack_metadata(collection.metadata, pack_id, display_name, version)
            await upsert_card_collection_record(db, collection)
            result.collections_imported += 1
        except Exception as exc:
            result.errors.append(f"collection upsert error [{collection.collection_id}]: {exc}")
    for template in templates:
        try:
            template.metadata = _decorate_card_pack_metadata(template.metadata, pack_id, display_name, version)
            await upsert_card_template_record(db, template)
            result.templates_imported += 1
        except Exception as exc:
            result.errors.append(f"template upsert error [{template.template_id}]: {exc}")
    return result


async def scan_card_packs_directory(db: AsyncSession) -> list[CardPackResult]:
    import json
    import pathlib
    base_dir = pathlib.Path(CARD_PACKS_DIR)
    if not base_dir.is_dir():
        logger.info("Card packs directory %s does not exist, skipping scan.", base_dir)
        return []
    results: list[CardPackResult] = []
    for path in sorted(base_dir.glob("*.json")):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                results.append(CardPackResult(pack_id=path.stem, errors=[f"invalid JSON structure in {path.name}"]))
                continue
            if not raw.get("pack_id"):
                raw["pack_id"] = path.stem
            result = await import_card_pack(db, raw)
            results.append(result)
            logger.info("Imported card pack %s from %s: %d collections, %d templates", result.pack_id, path.name, result.collections_imported, result.templates_imported)
        except Exception as exc:
            results.append(CardPackResult(pack_id=path.stem, errors=[f"file read error: {exc}"]))
    return results

