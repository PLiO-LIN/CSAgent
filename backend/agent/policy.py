import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

from tool.base import ToolEntry
from agent.state import find_recent_tool_execution


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


def enrich_tool_args(entry: ToolEntry, args: dict | None, agent_state: dict, phone: str = "", bound_args: dict[str, Any] | None = None) -> dict:
    result = dict(args or {})
    accepted = entry.accepted_arg_names()

    if phone and (accepted is None or "phone" in accepted) and not result.get("phone"):
        result["phone"] = phone

    for key, value in (bound_args or {}).items():
        if value in (None, "", [], {}):
            continue
        if accepted is None or key in accepted:
            result[key] = value

    return entry.sanitize_args(result)


def build_tool_fingerprint(entry: ToolEntry, args: dict | None, agent_state: dict) -> str:
    policy = entry.policy
    fields = list(policy.idempotency_key_fields or [])
    if not fields and (policy.external_side_effect or entry.requires_confirmation()):
        fields = [
            key
            for key in sorted((args or {}).keys())
            if (args or {}).get(key) not in (None, "", [], {})
        ][:8]
    if not fields:
        return ""

    parts = []
    for key in fields:
        value = (args or {}).get(key)
        if value in (None, "", [], {}):
            continue
        parts.append(f"{key}={_stable_text(value)}")
    if not parts:
        return ""
    raw = f"{entry.name}|{'|'.join(parts)}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()[:16]


def evaluate_tool_policy(entry: ToolEntry, args: dict | None, agent_state: dict) -> ToolPolicyDecision:
    runtime = (agent_state.get("runtime_state") or {})
    policy = entry.policy
    resolved_args = deepcopy(args or {})
    fingerprint = build_tool_fingerprint(entry, resolved_args, agent_state)

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
                    "next_actions": ["先确认当前动作是否已生效", "如需重新执行，请明确新的参数或上下文"],
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
) -> ToolPolicyDecision:
    next_actions = ["先补齐关键信息", "再继续当前客服流程"]
    fallback_tool = ""
    if fallback_to_knowledge:
        next_actions = ["优先补充规则、限制或说明信息", "必要时再继续当前业务流程"]
    message = f"[Tool Policy] 工具 {entry.name} 未执行：{reason}。"
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
        },
        history_entry={"kind": "tool_policy", "summary": f"{entry.name} 被策略阻止：{reason_code}"},
    )


def _stable_text(value: object) -> str:
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value)


def _join_reasons(*parts: str) -> str:
    return "；".join(str(part or "").strip() for part in parts if str(part or "").strip())
