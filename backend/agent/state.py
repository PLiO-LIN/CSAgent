from copy import deepcopy
from datetime import datetime
from typing import Any


MAX_HISTORY = 8
MAX_RECENT_OPERATIONS = 12

SCENARIO_PHASES = {
    "query": ["intent_collected", "querying", "completed", "blocked", "handoff_required"],
    "recommend": [
        "intent_collected",
        "products_recommended",
        "products_compared",
        "product_selected",
        "preview_ready",
        "completed",
        "blocked",
        "handoff_required",
    ],
    "order": [
        "intent_collected",
        "preview_ready",
        "existing_order_found",
        "sms_code_ready",
        "awaiting_user_confirmation",
        "confirmation_approved",
        "submitting",
        "order_submitted",
        "awaiting_payment",
        "payment_confirmed",
        "orders_queried",
        "completed",
        "blocked",
        "handoff_required",
    ],
    "recharge": ["intent_collected", "amount_ready", "link_ready", "completed", "blocked", "handoff_required"],
}

PHASE_NEXT_ACTIONS = {
    "intent_collected": ["补齐必要信息后再调用工具", "优先沿当前客服场景继续推进"],
    "products_recommended": ["解释推荐理由", "如用户犹豫可继续比较", "如用户明确要办理可先预览下单"],
    "products_compared": ["帮助用户收敛选择", "如用户明确要办理可先预览下单"],
    "product_selected": ["继续生成下单预览", "确认资费和支付方式"],
    "preview_ready": ["先确认资费与规则", "确认后再提交订单"],
    "existing_order_found": ["先解释已存在订单", "优先继续支付或查询该订单状态"],
    "sms_code_ready": ["引导用户在卡片中填写或核对验证码", "最终提交订单仅接受卡片按钮确认"],
    "awaiting_user_confirmation": ["等待用户明确确认", "未确认前不要再次提交业务动作"],
    "confirmation_approved": ["沿已确认参数继续执行下一步"],
    "submitting": ["等待提交结果", "提交失败时说明原因并给出下一步"],
    "order_submitted": ["说明订单已生成", "如需支付则引导进入支付确认"],
    "awaiting_payment": ["提醒用户完成外部支付", "支付后优先确认支付结果或查询订单"],
    "payment_confirmed": ["说明支付结果和生效信息", "如仍有疑问可继续查询订单状态"],
    "orders_queried": ["基于订单状态继续处理", "待支付订单优先继续支付或确认支付结果"],
    "amount_ready": ["让用户核对或修改充值金额", "确认金额后再生成充值链接"],
    "link_ready": ["说明充值链接和付费方式", "提醒用户跳转后自行完成充值"],
    "completed": ["本次业务闭环已完成", "如用户提出新需求可重新进入新场景"],
    "blocked": ["解释当前阻塞原因", "给出补救动作或转人工/知识库渠道"],
    "handoff_required": ["说明需要人工介入", "提供人工服务入口或办理渠道"],
    "querying": ["等待查询结果", "拿到结果后直接回答用户"],
}


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def default_agent_state() -> dict:
    return {
        "skill_state": {
            "active_skill": "",
            "active_skills": [],
            "skill_history": [],
            "updated_at": "",
        },
        "workflow_state": {
            "scenario": "",
            "phase": "",
            "goal": "",
            "last_user_message": "",
            "blocked_reason": "",
            "blocked_by": "",
            "next_actions": [],
            "service_channel": "",
            "current_task_id": "",
            "requires_human_handoff": False,
            "constraints": [],
            "entities": {
                "base_product_id": "",
                "candidate_product_ids": [],
                "compare_product_ids": [],
                "recommend_mode": "",
                "selected_product_id": "",
                "selected_product_name": "",
                "preview_id": "",
                "pay_mode": "",
                "sms_code": "",
                "verification_seq": "",
                "duplicate_order_id": "",
                "order_id": "",
                "order_status": "",
                "pay_status": "",
                "restriction_summary": "",
                "recharge_amount": "",
                "recharge_amount_yuan": "",
                "recharge_link": "",
                "recharge_billing_mode": "",
            },
            "flags": {
                "has_recommendation": False,
                "has_comparison": False,
                "preview_ready": False,
                "awaiting_confirmation": False,
                "sms_code_ready": False,
                "order_submitted": False,
                "payment_confirmed": False,
                "recharge_ready": False,
            },
            "history": [],
            "updated_at": "",
        },
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
    state["workflow_state"].setdefault("scenario", "")
    state["workflow_state"].setdefault("phase", "")
    state["workflow_state"].setdefault("goal", "")
    state["workflow_state"].setdefault("last_user_message", "")
    state["workflow_state"].setdefault("blocked_reason", "")
    state["workflow_state"].setdefault("blocked_by", "")
    state["workflow_state"].setdefault("next_actions", [])
    state["workflow_state"].setdefault("service_channel", "")
    state["workflow_state"].setdefault("current_task_id", "")
    state["workflow_state"].setdefault("requires_human_handoff", False)
    state["workflow_state"].setdefault("constraints", [])
    state["workflow_state"].setdefault("entities", {})
    state["workflow_state"].setdefault("flags", {})
    state["workflow_state"].setdefault("history", [])
    state.setdefault("runtime_state", {})
    state["runtime_state"].setdefault("recent_operations", [])
    state["runtime_state"].setdefault("last_user_action", {})
    state["runtime_state"].setdefault("compaction_failures", 0)
    state["runtime_state"].setdefault("last_compaction_error", "")
    state["runtime_state"].setdefault("context_budget", {})
    state["runtime_state"].setdefault("updated_at", "")
    for key, value in default_agent_state()["workflow_state"]["entities"].items():
        state["workflow_state"]["entities"].setdefault(key, deepcopy(value))
    for key, value in default_agent_state()["workflow_state"]["flags"].items():
        state["workflow_state"]["flags"].setdefault(key, value)
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
    previous = deepcopy(workflow)
    incoming_scenario = str(((patch or {}).get("scenario", "") or "")).strip()
    current_scenario = str((workflow.get("scenario", "") or "")).strip()
    if incoming_scenario and incoming_scenario != current_scenario:
        preserved_history = deepcopy(workflow.get("history", []))
        preserved_goal = str(workflow.get("goal", "") or "").strip()
        preserved_last_user_message = str(workflow.get("last_user_message", "") or "").strip()
        reset_workflow = deepcopy(default_agent_state()["workflow_state"])
        reset_workflow["history"] = preserved_history
        reset_workflow["goal"] = preserved_goal
        reset_workflow["last_user_message"] = preserved_last_user_message
        workflow.clear()
        workflow.update(reset_workflow)
    if patch:
        _deep_merge(workflow, patch)
    _normalize_workflow_machine(workflow, previous=previous, skill_state=state.get("skill_state") or {})
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
        if not str(workflow.get("phase", "")).strip():
            workflow["phase"] = "intent_collected"
        if not str(workflow.get("scenario", "")).strip():
            active_skill = str(((state.get("skill_state") or {}).get("active_skill") or "")).strip()
            if active_skill:
                workflow["scenario"] = active_skill
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

    scenario = str(workflow.get("scenario", "")).strip()
    phase = str(workflow.get("phase", "")).strip()
    goal = str(workflow.get("goal", "")).strip()
    blocked_reason = str(workflow.get("blocked_reason", "")).strip()
    blocked_by = str(workflow.get("blocked_by", "")).strip()
    service_channel = str(workflow.get("service_channel", "")).strip()
    current_task_id = str(workflow.get("current_task_id", "")).strip()
    next_actions = [str(x).strip() for x in workflow.get("next_actions", []) if str(x).strip()]
    constraints = [str(x).strip() for x in workflow.get("constraints", []) if str(x).strip()]
    entities = workflow.get("entities") or {}
    flags = workflow.get("flags") or {}
    history = workflow.get("history") or []
    if scenario or phase or goal or blocked_reason or blocked_by or next_actions or constraints or service_channel or current_task_id or _has_truthy(entities) or _has_truthy(flags):
        lines.append("### 当前 workflow_state")
        if scenario:
            lines.append(f"- scenario: {scenario}")
        if phase:
            lines.append(f"- phase: {phase}")
        if goal:
            lines.append(f"- goal: {goal}")
        if current_task_id:
            lines.append(f"- current_task_id: {current_task_id}")
        if service_channel:
            lines.append(f"- service_channel: {service_channel}")
        if blocked_reason:
            lines.append(f"- blocked_reason: {blocked_reason}")
        if blocked_by:
            lines.append(f"- blocked_by: {blocked_by}")
        if workflow.get("requires_human_handoff"):
            lines.append("- requires_human_handoff: True")
        if next_actions:
            lines.append(f"- next_actions: {'; '.join(next_actions)}")
        if constraints:
            lines.append(f"- constraints: {'; '.join(constraints)}")
        entity_lines = _format_mapping_lines("- entities", entities)
        if entity_lines:
            lines.extend(entity_lines)
        flag_lines = _format_mapping_lines("- flags", flags)
        if flag_lines:
            lines.extend(flag_lines)
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
    workflow["scenario"] = str(workflow.get("scenario", "") or "").strip()
    workflow["phase"] = str(workflow.get("phase", "") or "").strip()
    workflow["goal"] = str(workflow.get("goal", "") or "").strip()
    workflow["last_user_message"] = str(workflow.get("last_user_message", "") or "").strip()
    workflow["blocked_reason"] = str(workflow.get("blocked_reason", "") or "").strip()
    workflow["blocked_by"] = str(workflow.get("blocked_by", "") or "").strip()
    workflow["service_channel"] = str(workflow.get("service_channel", "") or "").strip()
    workflow["current_task_id"] = str(workflow.get("current_task_id", "") or "").strip()
    workflow["constraints"] = _dedup_list(workflow.get("constraints", []))
    workflow["next_actions"] = _dedup_list(workflow.get("next_actions", []))
    workflow["entities"] = workflow.get("entities") or {}
    workflow["flags"] = workflow.get("flags") or {}

    if not workflow["scenario"]:
        active_skill = str(((skill_state or {}).get("active_skill") or "")).strip()
        if active_skill:
            workflow["scenario"] = active_skill

    if workflow["scenario"] and not workflow["phase"]:
        workflow["phase"] = "intent_collected"

    phase = workflow["phase"]
    phase_changed = bool(previous and previous.get("phase") != phase)
    entities = workflow["entities"]
    flags = workflow["flags"]
    if phase in {"products_recommended", "products_compared", "preview_ready", "existing_order_found"}:
        flags["has_recommendation"] = True
    if phase == "products_compared":
        flags["has_comparison"] = True
    if phase in {"preview_ready", "existing_order_found", "sms_code_ready", "awaiting_user_confirmation", "confirmation_approved", "submitting", "order_submitted", "awaiting_payment", "payment_confirmed", "orders_queried", "completed"}:
        flags["preview_ready"] = bool(flags.get("preview_ready") or entities.get("preview_id") or entities.get("selected_product_id"))
    if phase == "awaiting_user_confirmation":
        flags["awaiting_confirmation"] = True
    elif phase:
        flags["awaiting_confirmation"] = False
    if phase == "sms_code_ready":
        flags["sms_code_ready"] = True
    elif phase:
        flags["sms_code_ready"] = False
    if phase in {"order_submitted", "awaiting_payment", "payment_confirmed", "orders_queried", "completed"}:
        flags["order_submitted"] = True
    if phase in {"payment_confirmed", "completed"}:
        flags["payment_confirmed"] = True
    if phase in {"amount_ready", "link_ready", "completed"} and workflow.get("scenario") == "recharge":
        flags["recharge_ready"] = True
    elif workflow.get("scenario") == "recharge" and phase:
        flags["recharge_ready"] = False

    inferred_task_id = _infer_current_task_id(entities)
    if inferred_task_id and (not workflow["current_task_id"] or phase_changed):
        workflow["current_task_id"] = inferred_task_id

    if phase == "blocked":
        workflow["blocked_reason"] = workflow["blocked_reason"] or "当前业务条件不足，暂不能继续"
    elif phase_changed and previous and workflow["blocked_reason"] == str(previous.get("blocked_reason", "") or "").strip():
        workflow["blocked_reason"] = ""
        workflow["blocked_by"] = ""
    elif phase != "handoff_required" and not workflow["blocked_reason"]:
        workflow["blocked_by"] = ""

    if phase != "handoff_required" and phase_changed and previous and workflow.get("requires_human_handoff") == bool(previous.get("requires_human_handoff")):
        workflow["requires_human_handoff"] = False
    else:
        workflow["requires_human_handoff"] = bool(workflow.get("requires_human_handoff")) or phase == "handoff_required"
    if phase_changed and previous and workflow["next_actions"] == _dedup_list(previous.get("next_actions", [])):
        workflow["next_actions"] = []
    if not workflow["next_actions"]:
        workflow["next_actions"] = _default_next_actions(workflow["scenario"], phase)

    if previous and previous.get("phase") != phase and phase in {"completed", "payment_confirmed"} and not workflow["service_channel"]:
        workflow["service_channel"] = workflow.get("service_channel", "") or "线上客服"

    return workflow


def _infer_current_task_id(entities: dict) -> str:
    for key in ["order_id", "verification_seq", "preview_id", "selected_product_id", "base_product_id"]:
        value = str((entities or {}).get(key, "") or "").strip()
        if value:
            return value
    return ""


def _default_next_actions(scenario: str, phase: str) -> list[str]:
    actions = list(PHASE_NEXT_ACTIONS.get(str(phase or "").strip(), []))
    if actions:
        return actions
    if str(scenario or "").strip() == "order":
        return ["沿订单闭环继续推进", "必要时查询订单或确认支付结果"]
    if str(scenario or "").strip() == "recommend":
        return ["沿推荐闭环继续推进", "必要时继续比较或预览下单"]
    if str(scenario or "").strip() == "query":
        return ["优先完成查询并直接回答用户"]
    if str(scenario or "").strip() == "recharge":
        return ["围绕充值闭环继续推进", "确认金额与付费方式后再返回充值链接"]
    return ["继续围绕当前用户诉求处理"]
