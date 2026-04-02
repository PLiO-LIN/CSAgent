from copy import deepcopy
from datetime import datetime
from typing import Any


MAX_HISTORY = 8
MAX_RECENT_OPERATIONS = 12


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


WORKFLOW_DEFAULTS = {
    "goal": "",
    "last_user_message": "",
    "blocked_reason": "",
    "blocked_by": "",
    "next_actions": [],
    "history": [],
    "updated_at": "",
}


def default_agent_state() -> dict:
    return {
        "skill_state": {
            "active_skill": "",
            "active_skills": [],
            "skill_history": [],
            "updated_at": "",
        },
        "workflow_state": deepcopy(WORKFLOW_DEFAULTS),
        "runtime_state": {
            "recent_operations": [],
            "last_user_action": {},
            "compaction_failures": 0,
            "last_compaction_error": "",
            "context_budget": {},
            "updated_at": "",
        },
        "pending_confirmation": {},
        "updated_at": "",
    }


def load_agent_state(metadata: dict | None = None) -> dict:
    state = default_agent_state()
    raw = {}
    if metadata:
        raw = metadata.get("agent_state") or {}
    _deep_merge(state, raw)
    state["skill_state"].setdefault("active_skill", "")
    state["skill_state"].setdefault("active_skills", [])
    state["skill_state"].setdefault("skill_history", [])
    workflow = state.get("workflow_state") or {}
    state["workflow_state"] = {key: deepcopy(workflow.get(key, value)) for key, value in WORKFLOW_DEFAULTS.items()}
    state.setdefault("runtime_state", {})
    state["runtime_state"].setdefault("recent_operations", [])
    state["runtime_state"].setdefault("last_user_action", {})
    state["runtime_state"].setdefault("compaction_failures", 0)
    state["runtime_state"].setdefault("last_compaction_error", "")
    state["runtime_state"].setdefault("context_budget", {})
    state["runtime_state"].setdefault("updated_at", "")
    state["skill_state"]["active_skills"] = _dedup_list(state["skill_state"].get("active_skills", []))
    if state["skill_state"]["active_skill"] and state["skill_state"]["active_skill"] not in state["skill_state"]["active_skills"]:
        state["skill_state"]["active_skills"].append(state["skill_state"]["active_skill"])
    state["skill_state"]["skill_history"] = _dedup_list(state["skill_state"].get("skill_history", []), limit=MAX_HISTORY)
    state["workflow_state"]["history"] = _normalize_history(state["workflow_state"].get("history", []))
    state["runtime_state"]["recent_operations"] = _normalize_recent_operations(state["runtime_state"].get("recent_operations", []))
    _normalize_workflow_machine(state["workflow_state"], skill_state=state.get("skill_state") or {})
    return state


def set_active_skill(state: dict, skill_name: str, mode: str = "switch") -> dict:
    skill_name = str(skill_name or "").strip()
    if not skill_name:
        return state
    skill_state = state.setdefault("skill_state", default_agent_state()["skill_state"])
    current = list(skill_state.get("active_skills", []))
    if mode == "append":
        current.append(skill_name)
        active_skills = _dedup_list(current)
    else:
        active_skills = [skill_name]
    skill_state["active_skills"] = active_skills
    skill_state["active_skill"] = skill_name
    skill_state["skill_history"] = _dedup_list(skill_state.get("skill_history", []) + [skill_name], limit=MAX_HISTORY)
    skill_state["updated_at"] = now_text()
    state["updated_at"] = skill_state["updated_at"]
    return state


def clear_pending_confirmation(state: dict) -> dict:
    state["pending_confirmation"] = {}
    state["updated_at"] = now_text()
    return state


def set_pending_confirmation(
    state: dict,
    tool_name: str,
    args: dict,
    tool_call_id: str,
    user_message_id: str = "",
    user_message_at: float = 0,
    summary: str = "",
    policy_snapshot: dict | None = None,
    fingerprint: str = "",
) -> dict:
    state["pending_confirmation"] = {
        "tool_name": str(tool_name or "").strip(),
        "tool_call_id": str(tool_call_id or "").strip(),
        "args": deepcopy(args or {}),
        "summary": str(summary or "").strip(),
        "policy": deepcopy(policy_snapshot or {}),
        "fingerprint": str(fingerprint or "").strip(),
        "requested_after_user_message_id": str(user_message_id or "").strip(),
        "requested_after_user_at": float(user_message_at or 0),
        "requested_at": now_text(),
    }
    state["updated_at"] = state["pending_confirmation"]["requested_at"]
    return state


def update_workflow_state(state: dict, patch: dict | None = None, history_entry: str | dict | None = None) -> dict:
    workflow = state.setdefault("workflow_state", default_agent_state()["workflow_state"])
    if patch:
        allowed_patch = {key: deepcopy(value) for key, value in (patch or {}).items() if key in WORKFLOW_DEFAULTS}
        _deep_merge(workflow, allowed_patch)
    _normalize_workflow_machine(workflow, skill_state=state.get("skill_state") or {})
    if history_entry:
        history = workflow.setdefault("history", [])
        if isinstance(history_entry, str):
            history.append({"summary": history_entry.strip(), "at": now_text()})
        elif isinstance(history_entry, dict):
            item = {k: deepcopy(v) for k, v in history_entry.items()}
            item.setdefault("at", now_text())
            history.append(item)
        workflow["history"] = _normalize_history(history)
    workflow["updated_at"] = now_text()
    state["updated_at"] = workflow["updated_at"]
    return state


def update_workflow_user_message(state: dict, text: str) -> dict:
    text = str(text or "").strip()
    workflow = state.setdefault("workflow_state", default_agent_state()["workflow_state"])
    workflow["last_user_message"] = text
    if text and not _is_control_message(text):
        workflow["goal"] = text[:160]
    _normalize_workflow_machine(workflow, skill_state=state.get("skill_state") or {})
    workflow["updated_at"] = now_text()
    state["updated_at"] = workflow["updated_at"]
    return state


def update_runtime_state(state: dict, patch: dict | None = None) -> dict:
    runtime = state.setdefault("runtime_state", default_agent_state()["runtime_state"])
    if patch:
        _deep_merge(runtime, patch)
    runtime["recent_operations"] = _normalize_recent_operations(runtime.get("recent_operations", []))
    runtime["updated_at"] = now_text()
    state["updated_at"] = runtime["updated_at"]
    return state


def update_context_budget(state: dict, report: dict | None = None) -> dict:
    runtime = state.setdefault("runtime_state", default_agent_state()["runtime_state"])
    runtime["context_budget"] = deepcopy(report or {})
    runtime["updated_at"] = now_text()
    state["updated_at"] = runtime["updated_at"]
    return state


def mark_compaction_failure(state: dict, error: str) -> dict:
    runtime = state.setdefault("runtime_state", default_agent_state()["runtime_state"])
    runtime["compaction_failures"] = int(runtime.get("compaction_failures", 0) or 0) + 1
    runtime["last_compaction_error"] = str(error or "").strip()
    runtime["updated_at"] = now_text()
    state["updated_at"] = runtime["updated_at"]
    return state


def clear_compaction_failure(state: dict) -> dict:
    runtime = state.setdefault("runtime_state", default_agent_state()["runtime_state"])
    runtime["compaction_failures"] = 0
    runtime["last_compaction_error"] = ""
    runtime["updated_at"] = now_text()
    state["updated_at"] = runtime["updated_at"]
    return state


def record_tool_execution(
    state: dict,
    tool_name: str,
    fingerprint: str,
    args: dict | None = None,
    status: str = "success",
    summary: str = "",
) -> dict:
    runtime = state.setdefault("runtime_state", default_agent_state()["runtime_state"])
    history = list(runtime.get("recent_operations", []))
    history.append(
        {
            "tool_name": str(tool_name or "").strip(),
            "fingerprint": str(fingerprint or "").strip(),
            "args": deepcopy(args or {}),
            "status": str(status or "success").strip(),
            "summary": str(summary or "").strip(),
            "at": now_text(),
        }
    )
    runtime["recent_operations"] = _normalize_recent_operations(history)
    runtime["updated_at"] = now_text()
    state["updated_at"] = runtime["updated_at"]
    return state


def find_recent_tool_execution(state: dict, tool_name: str, fingerprint: str) -> dict | None:
    runtime = state.get("runtime_state") or {}
    for item in reversed(runtime.get("recent_operations", [])):
        if str(item.get("tool_name", "")).strip() != str(tool_name or "").strip():
            continue
        if str(item.get("fingerprint", "")).strip() != str(fingerprint or "").strip():
            continue
        return deepcopy(item)
    return None


def format_agent_state(state: dict, include_history: bool = True) -> str:
    skill = state.get("skill_state") or {}
    workflow = state.get("workflow_state") or {}
    runtime = state.get("runtime_state") or {}
    pending = state.get("pending_confirmation") or {}
    lines: list[str] = []

    active_skill = str(skill.get("active_skill", "")).strip()
    active_skills = [str(x).strip() for x in skill.get("active_skills", []) if str(x).strip()]
    if active_skill or active_skills:
        lines.append("### 当前技能状态")
        if active_skill:
            lines.append(f"- 当前激活技能: {active_skill}")
        if active_skills:
            lines.append(f"- 当前启用技能集合: {', '.join(active_skills)}")

    goal = str(workflow.get("goal", "")).strip()
    blocked_reason = str(workflow.get("blocked_reason", "")).strip()
    blocked_by = str(workflow.get("blocked_by", "")).strip()
    next_actions = [str(x).strip() for x in workflow.get("next_actions", []) if str(x).strip()]
    history = workflow.get("history") or []
    if goal or blocked_reason or blocked_by or next_actions:
        lines.append("### 当前对话运行态")
        if goal:
            lines.append(f"- goal: {goal}")
        if blocked_reason:
            lines.append(f"- blocked_reason: {blocked_reason}")
        if blocked_by:
            lines.append(f"- blocked_by: {blocked_by}")
        if next_actions:
            lines.append(f"- next_actions: {'; '.join(next_actions)}")
        if include_history and history:
            lines.append("- recent_history:")
            for item in history[-4:]:
                summary = str(item.get("summary", "")).strip()
                kind = str(item.get("kind", "")).strip()
                at = str(item.get("at", "")).strip()
                parts = [summary] if summary else []
                if kind:
                    parts.append(f"kind={kind}")
                if at:
                    parts.append(f"at={at}")
                if parts:
                    lines.append(f"  - {'; '.join(parts)}")

    context_budget = runtime.get("context_budget") or {}
    recent_operations = runtime.get("recent_operations") or []
    if _has_truthy(context_budget) or recent_operations or runtime.get("compaction_failures"):
        lines.append("### Runtime State")
        if runtime.get("compaction_failures"):
            lines.append(f"- compaction_failures: {runtime.get('compaction_failures')}")
        if runtime.get("last_compaction_error"):
            lines.append(f"- last_compaction_error: {runtime.get('last_compaction_error')}")
        budget_lines = _format_mapping_lines("- context_budget", context_budget)
        if budget_lines:
            lines.extend(budget_lines)
        if include_history and recent_operations:
            lines.append("- recent_operations:")
            for item in recent_operations[-4:]:
                tool_name = str(item.get("tool_name", "")).strip()
                summary = str(item.get("summary", "")).strip()
                status = str(item.get("status", "")).strip()
                at = str(item.get("at", "")).strip()
                parts = []
                if tool_name:
                    parts.append(tool_name)
                if summary:
                    parts.append(summary)
                if status:
                    parts.append(f"status={status}")
                if at:
                    parts.append(f"at={at}")
                if parts:
                    lines.append(f"  - {'; '.join(parts)}")

    if pending:
        lines.append("### 待确认动作")
        lines.append(f"- tool: {pending.get('tool_name', '')}")
        args = pending.get("args") or {}
        arg_lines = _format_mapping_lines("- args", args)
        if arg_lines:
            lines.extend(arg_lines)
        if pending.get("summary"):
            lines.append(f"- summary: {pending.get('summary')}")
        if pending.get("fingerprint"):
            lines.append(f"- fingerprint: {pending.get('fingerprint')}")
        if pending.get("requested_at"):
            lines.append(f"- requested_at: {pending.get('requested_at')}")

    return "\n".join(lines).strip()


def _deep_merge(target: dict, patch: dict) -> dict:
    for key, value in (patch or {}).items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            _deep_merge(target[key], value)
        else:
            target[key] = deepcopy(value)
    return target


def _normalize_history(history: list[Any]) -> list[dict]:
    items: list[dict] = []
    for item in history or []:
        if isinstance(item, str):
            text = item.strip()
            if text:
                items.append({"summary": text, "at": now_text()})
        elif isinstance(item, dict):
            entry = {k: deepcopy(v) for k, v in item.items()}
            if entry.get("summary"):
                entry.setdefault("at", now_text())
                items.append(entry)
    return items[-MAX_HISTORY:]


def _normalize_recent_operations(history: list[Any]) -> list[dict]:
    items: list[dict] = []
    for item in history or []:
        if not isinstance(item, dict):
            continue
        tool_name = str(item.get("tool_name", "")).strip()
        fingerprint = str(item.get("fingerprint", "")).strip()
        if not tool_name or not fingerprint:
            continue
        entry = {k: deepcopy(v) for k, v in item.items()}
        entry.setdefault("status", "success")
        entry.setdefault("summary", "")
        entry.setdefault("args", {})
        entry.setdefault("at", now_text())
        items.append(entry)
    return items[-MAX_RECENT_OPERATIONS:]


def _dedup_list(values: list[Any], limit: int = 0) -> list[str]:
    seen = set()
    result: list[str] = []
    for value in values or []:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    if limit and len(result) > limit:
        return result[-limit:]
    return result


def _is_control_message(text: str) -> bool:
    stripped = str(text or "").strip()
    if not stripped:
        return True
    controls = ["确认", "确定", "可以", "继续", "取消", "不用", "不要", "算了", "好的", "好"]
    return len(stripped) <= 8 and any(token in stripped for token in controls)


def _has_truthy(data: dict) -> bool:
    for value in (data or {}).values():
        if isinstance(value, dict) and _has_truthy(value):
            return True
        if isinstance(value, list) and value:
            return True
        if value not in (None, "", False, [], {}):
            return True
    return False


def _format_mapping_lines(label: str, data: dict) -> list[str]:
    rows = []
    compact = {k: v for k, v in (data or {}).items() if v not in (None, "", False, [], {})}
    if not compact:
        return rows
    rows.append(f"{label}:")
    for key, value in compact.items():
        if isinstance(value, list):
            rows.append(f"  - {key}: {', '.join(str(x) for x in value)}")
        else:
            rows.append(f"  - {key}: {value}")
    return rows


def _normalize_workflow_machine(workflow: dict, previous: dict | None = None, skill_state: dict | None = None) -> dict:
    workflow["goal"] = str(workflow.get("goal", "") or "").strip()
    workflow["last_user_message"] = str(workflow.get("last_user_message", "") or "").strip()
    workflow["blocked_reason"] = str(workflow.get("blocked_reason", "") or "").strip()
    workflow["blocked_by"] = str(workflow.get("blocked_by", "") or "").strip()
    workflow["next_actions"] = _dedup_list(workflow.get("next_actions", []))
    workflow["history"] = _normalize_history(workflow.get("history", []))
    if workflow["blocked_reason"] and not workflow["next_actions"]:
        workflow["next_actions"] = ["向用户解释当前限制", "补齐信息后再继续"]

    return workflow
