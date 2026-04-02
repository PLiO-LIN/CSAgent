import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

from tool.base import ToolEntry
from agent.state import find_recent_tool_execution


ENTITY_ARG_ALIASES = {
    "product_id": ["selected_product_id", "base_product_id"],
    "selected_product_id": ["product_id", "selected_product_id", "base_product_id"],
    "order_id": ["order_id", "duplicate_order_id"],
    "duplicate_order_id": ["order_id", "duplicate_order_id"],
    "pay_mode": ["pay_mode"],
    "preview_id": ["preview_id"],
    "sms_code": ["sms_code"],
    "verification_seq": ["verification_seq"],
}

ENTITY_REQUIREMENT_ALIASES = {
    "selected_product_id": ["product_id", "selected_product_id", "base_product_id"],
    "base_product_id": ["product_id", "selected_product_id", "base_product_id"],
    "order_id": ["order_id", "duplicate_order_id"],
    "duplicate_order_id": ["order_id", "duplicate_order_id"],
    "pay_mode": ["pay_mode"],
    "preview_id": ["preview_id"],
    "sms_code": ["sms_code"],
    "verification_seq": ["verification_seq"],
}


@dataclass
class ToolPolicyDecision:
    allow: bool = True
    requires_confirmation: bool = False
    reason_code: str = ""
    reason: str = ""
    message: str = ""
    fallback_tool: str = ""
    fingerprint: str = ""
    resolved_args: dict[str, Any] = field(default_factory=dict)
    workflow_patch: dict[str, Any] = field(default_factory=dict)
    history_entry: dict[str, Any] = field(default_factory=dict)


def enrich_tool_args(entry: ToolEntry, args: dict | None, agent_state: dict, phone: str = "") -> dict:
    result = dict(args or {})
    workflow = (agent_state.get("workflow_state") or {})
    entities = workflow.get("entities") or {}
    accepted = entry.accepted_arg_names()

    if phone and (accepted is None or "phone" in accepted) and not result.get("phone"):
        result["phone"] = phone

    for arg_name in accepted or []:
        if result.get(arg_name) not in (None, "", [], {}):
            continue
        for entity_key in ENTITY_ARG_ALIASES.get(arg_name, [arg_name]):
            value = entities.get(entity_key)
            if value not in (None, "", [], {}):
                result[arg_name] = deepcopy(value)
                break

    return entry.sanitize_args(result)


def build_tool_fingerprint(entry: ToolEntry, args: dict | None, agent_state: dict) -> str:
    policy = entry.policy
    workflow = (agent_state.get("workflow_state") or {})
    fields = list(policy.idempotency_key_fields or [])
    if not fields and (policy.external_side_effect or entry.requires_confirmation()):
        fields = [
            key
            for key in ["phone", "product_id", "order_id", "preview_id", "pay_mode"]
            if _resolve_value(key, args or {}, workflow) not in (None, "", [], {})
        ]
    if not fields:
        return ""

    parts = []
    for key in fields:
        value = _resolve_value(key, args or {}, workflow)
        if value in (None, "", [], {}):
            continue
        parts.append(f"{key}={_stable_text(value)}")
    if not parts:
        return ""
    raw = f"{entry.name}|{'|'.join(parts)}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()[:16]


def evaluate_tool_policy(entry: ToolEntry, args: dict | None, agent_state: dict) -> ToolPolicyDecision:
    workflow = (agent_state.get("workflow_state") or {})
    runtime = (agent_state.get("runtime_state") or {})
    scenario = str(workflow.get("scenario", "") or "").strip()
    phase = str(workflow.get("phase", "") or "").strip()
    flags = workflow.get("flags") or {}
    policy = entry.policy
    resolved_args = deepcopy(args or {})
    last_user_action = runtime.get("last_user_action") if isinstance(runtime.get("last_user_action"), dict) else {}
    if entry.name == "submit_order" and last_user_action:
        for field in ["sms_code", "preview_id", "pay_mode", "product_id", "verification_seq"]:
            if resolved_args.get(field) not in (None, "", [], {}) and field != "product_id":
                continue
            if field == "product_id" and resolved_args.get(field) not in (None, "", [], {}):
                continue
            value = last_user_action.get(field)
            if value not in (None, "", [], {}):
                resolved_args[field] = deepcopy(value)
    fingerprint = build_tool_fingerprint(entry, resolved_args, agent_state)

    if entry.name == "submit_order":
        action_type = str(last_user_action.get("action", "") or "").strip()
        action_source = str(last_user_action.get("source", "") or "").strip()
        order_id = str(((workflow.get("entities") or {}).get("order_id", "") or (workflow.get("entities") or {}).get("duplicate_order_id", "")).strip())
        pay_status = str(((workflow.get("entities") or {}).get("pay_status", "") or "")).strip().upper()
        continuing_existing_pending_order = bool(order_id and pay_status in {"PENDING", "待支付"} and phase in {"existing_order_found", "awaiting_payment", "orders_queried"})
        if continuing_existing_pending_order:
            return ToolPolicyDecision(
                allow=True,
                requires_confirmation=False,
                fingerprint=fingerprint,
                resolved_args=resolved_args,
            )
        if action_type != "confirm_order_submit" or action_source != "card_action":
            reason = _join_reasons("最终下单只能通过验证码卡片上的确认按钮触发，不能直接使用自然语言确认")
            return _blocked_decision(
                entry,
                resolved_args,
                reason_code="card_confirmation_required",
                reason=reason,
                fallback_to_knowledge=False,
                phase=phase,
            )
        if resolved_args.get("sms_code") in (None, "", [], {}):
            reason = _join_reasons("缺少验证码，请先在卡片中填写验证码后再点击确认下单")
            return _blocked_decision(
                entry,
                resolved_args,
                reason_code="missing_sms_code",
                reason=reason,
                fallback_to_knowledge=False,
                phase=phase,
            )

    if policy.allowed_scenarios and scenario not in policy.allowed_scenarios:
        reason = _join_reasons(
            f"当前场景为 {scenario or '未识别'}，工具 {entry.name} 仅适用于 {', '.join(policy.allowed_scenarios)}"
        )
        return _blocked_decision(
            entry,
            resolved_args,
            reason_code="scenario_mismatch",
            reason=reason,
            fallback_to_knowledge=policy.fallback_to_knowledge,
            phase=phase,
        )

    if policy.allowed_phases and phase not in policy.allowed_phases:
        reason = _join_reasons(
            f"当前业务阶段为 {phase or '未建立'}，工具 {entry.name} 适用阶段为 {', '.join(policy.allowed_phases)}"
        )
        return _blocked_decision(
            entry,
            resolved_args,
            reason_code="phase_mismatch",
            reason=reason,
            fallback_to_knowledge=policy.fallback_to_knowledge,
            phase=phase,
        )

    missing_entities = [
        key
        for key in policy.required_entities
        if _resolve_required_entity_value(key, resolved_args, workflow) in (None, "", [], {})
    ]
    if missing_entities:
        reason = _join_reasons(f"缺少必要业务实体: {', '.join(missing_entities)}")
        return _blocked_decision(
            entry,
            resolved_args,
            reason_code="missing_entities",
            reason=reason,
            fallback_to_knowledge=policy.fallback_to_knowledge,
            phase=phase,
        )

    missing_flags = [key for key in policy.required_flags if not flags.get(key)]
    if missing_flags:
        reason = _join_reasons(f"当前状态尚未满足标记条件: {', '.join(missing_flags)}")
        return _blocked_decision(
            entry,
            resolved_args,
            reason_code="missing_flags",
            reason=reason,
            fallback_to_knowledge=policy.fallback_to_knowledge,
            phase=phase,
        )

    pending = agent_state.get("pending_confirmation") or {}
    if pending and policy.external_side_effect:
        pending_tool = str(pending.get("tool_name", "") or "").strip()
        pending_fingerprint = str(pending.get("fingerprint", "") or "").strip()
        if pending_tool and (pending_tool != entry.name or (fingerprint and pending_fingerprint and pending_fingerprint != fingerprint)):
            reason = _join_reasons(f"当前仍有待确认动作 {pending_tool}，请先完成或取消")
            return _blocked_decision(
                entry,
                resolved_args,
                reason_code="pending_conflict",
                reason=reason,
                fallback_to_knowledge=False,
                phase=phase,
            )

    if fingerprint and (policy.external_side_effect or entry.requires_confirmation()):
        recent = find_recent_tool_execution(agent_state, entry.name, fingerprint)
        if recent and str(recent.get("status", "") or "") == "success":
            reason = _join_reasons("检测到同一业务动作刚刚执行过，已触发幂等保护")
            return ToolPolicyDecision(
                allow=False,
                requires_confirmation=False,
                reason_code="duplicate_action",
                reason=reason,
                message=f"[Tool Policy] 工具 {entry.name} 未执行：{reason}。如需继续，请先查询当前业务结果或明确变更办理对象。",
                fallback_tool="",
                fingerprint=fingerprint,
                resolved_args=resolved_args,
                workflow_patch={
                    "blocked_reason": reason,
                    "blocked_by": entry.name,
                    "next_actions": ["先查询当前订单/状态", "如需重新办理，请明确新的产品或订单信息"],
                },
                history_entry={"kind": "tool_policy", "summary": f"已阻止重复执行 {entry.name}"},
            )

    return ToolPolicyDecision(
        allow=True,
        requires_confirmation=entry.requires_confirmation(),
        fingerprint=fingerprint,
        resolved_args=resolved_args,
    )


def _blocked_decision(
    entry: ToolEntry,
    args: dict,
    reason_code: str,
    reason: str,
    fallback_to_knowledge: bool,
    phase: str,
) -> ToolPolicyDecision:
    next_actions = ["先补齐关键信息", "再继续当前客服流程"]
    fallback_tool = "search_knowledge" if fallback_to_knowledge else ""
    if fallback_to_knowledge:
        next_actions = ["优先使用 search_knowledge 查询办理渠道和限制条件", "必要时再继续当前业务流程"]
    message = f"[Tool Policy] 工具 {entry.name} 未执行：{reason}。"
    if fallback_tool:
        message += " 请先改用 `search_knowledge` 查询办理入口、规则或限制。"
    return ToolPolicyDecision(
        allow=False,
        requires_confirmation=False,
        reason_code=reason_code,
        reason=reason,
        message=message,
        fallback_tool=fallback_tool,
        resolved_args=deepcopy(args or {}),
        workflow_patch={
            "blocked_reason": reason,
            "blocked_by": entry.name,
            "next_actions": next_actions,
            "phase": phase or "intent_collected",
        },
        history_entry={"kind": "tool_policy", "summary": f"{entry.name} 被策略阻止：{reason_code}"},
    )


def _resolve_required_entity_value(key: str, args: dict, workflow: dict) -> Any:
    entities = workflow.get("entities") or {}
    if key in entities and entities.get(key) not in (None, "", [], {}):
        return entities.get(key)
    for alias in ENTITY_REQUIREMENT_ALIASES.get(key, [key]):
        if alias in args and args.get(alias) not in (None, "", [], {}):
            return args.get(alias)
        if alias in entities and entities.get(alias) not in (None, "", [], {}):
            return entities.get(alias)
    return None


def _resolve_value(key: str, args: dict, workflow: dict) -> Any:
    if key in args and args.get(key) not in (None, "", [], {}):
        return args.get(key)
    entities = workflow.get("entities") or {}
    if key in entities and entities.get(key) not in (None, "", [], {}):
        return entities.get(key)
    for alias in ENTITY_ARG_ALIASES.get(key, [key]):
        if alias in args and args.get(alias) not in (None, "", [], {}):
            return args.get(alias)
        if alias in entities and entities.get(alias) not in (None, "", [], {}):
            return entities.get(alias)
    return None


def _stable_text(value: Any) -> str:
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value)


def _join_reasons(*parts: str) -> str:
    return "；".join(str(part or "").strip() for part in parts if str(part or "").strip())
