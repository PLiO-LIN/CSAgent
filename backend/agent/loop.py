import json
import hashlib
import logging
import time
from typing import Any, AsyncIterator
from sqlalchemy.ext.asyncio import AsyncSession

from agent.state import (
    clear_compaction_failure,
    clear_pending_confirmation,
    mark_compaction_failure,
    load_agent_state,
    record_tool_execution,
    set_active_skill,
    set_pending_confirmation,
    update_context_budget,
    update_runtime_state,
    update_workflow_state,
    update_workflow_user_message,
)
from agent.system import build_system
from agent.context import apply_budget_governance, rebuild, needs_compaction, find_keep_from_message_id
from agent.compaction import compact
from agent.reminder import check_reminders
from agent.policy import enrich_tool_args, evaluate_tool_policy
from mcp_runtime import ensure_mcp_tools_loaded
from provider.base import Provider, ToolDef
from tool.registry import get_tool, parse_args, global_tool_defs
from skill.base import get_skill, Skill
from db import crud
from config import settings

logger = logging.getLogger(__name__)


class Event:
    def __init__(self, type: str, **kwargs):
        self.type = type
        self.data = kwargs

    def to_dict(self) -> dict:
        return {"type": self.type, **self.data}


def _card_id(name: str, args: dict, suffix: str = "") -> str:
    """基于工具名和参数生成确定性卡片 ID，使模型可预测。"""
    phone = str(args.get("phone", ""))
    prefix = {
        "query_package": "pkg",
        "query_balance": "bal",
        "query_bill": "bill",
        "recommend_products": "reco",
        "compare_products": "cmp",
        "query_orders": "order",
        "preview_order": "preview",
        "submit_order": "pay",
        "confirm_order_payment": "payok",
    }.get(name, name)
    safe_suffix = "".join(ch if ch.isalnum() or ch in {"_", "-"} else "_" for ch in str(suffix).strip())
    if safe_suffix:
        base_suffix = f"_{safe_suffix}"
    elif name == "query_bill":
        fd = str(args.get("from_date", "")).replace("-", "")
        td = str(args.get("to_date", "")).replace("-", "")
        base_suffix = f"_{fd}-{td}" if fd and td else ""
    else:
        month = str(args.get("month", ""))
        base_suffix = f"_{month}" if month else ""
    raw = f"{prefix}_{phone}{base_suffix}"
    return raw if len(raw) < 40 else f"{prefix}_{hashlib.md5(raw.encode()).hexdigest()[:10]}"


def _collect_tools(loaded_skills: list[Skill]) -> list[ToolDef]:
    """组装当前可用工具 = 全局工具 + 所有已加载技能的工具（去重）"""
    tools = list(global_tool_defs())
    seen = {t.name for t in tools}
    for skill in loaded_skills:
        for td in skill.available_tools():
            if td.name not in seen:
                tools.append(td)
                seen.add(td.name)
    return tools


def _load_skills_from_state(agent_state: dict, initial_skill: str = "") -> list[Skill]:
    names = list((agent_state.get("skill_state") or {}).get("active_skills", []))
    if initial_skill and initial_skill not in names:
        names.append(initial_skill)
    result = []
    seen = set()
    for name in names:
        skill = get_skill(name)
        if skill and skill.name not in seen:
            result.append(skill)
            seen.add(skill.name)
    return result


def _latest_user_message(db_messages: list[Any]) -> dict[str, Any]:
    for msg in reversed(db_messages):
        if getattr(msg, "role", "") != "user":
            continue
        texts = []
        has_input = False
        client_meta = {}
        for part in sorted(getattr(msg, "parts", []), key=lambda p: p.index):
            if part.type == "text":
                texts.append(part.content)
                has_input = True
                part_meta = getattr(part, "metadata_", None) or {}
                raw_client_meta = part_meta.get("client_meta") if isinstance(part_meta, dict) else {}
                if isinstance(raw_client_meta, dict) and raw_client_meta:
                    client_meta = dict(raw_client_meta)
            elif part.type == "card":
                texts.append(part.content)
                has_input = True
        if has_input:
            return {
                "id": getattr(msg, "id", ""),
                "created_at": float(getattr(msg, "created_at", 0) or 0),
                "text": "\n".join(t for t in texts if t).strip(),
                "client_meta": client_meta,
            }
    return {"id": "", "created_at": 0.0, "text": "", "client_meta": {}}


def _normalize_tool_args(args: dict, phone: str) -> dict:
    result = dict(args or {})
    if phone and not result.get("phone"):
        result["phone"] = phone
    return result


def _prepare_tool_args(entry: Any, args: dict, phone: str) -> dict:
    result = dict(args or {})
    if phone and entry and getattr(entry, "accepts_argument", None) and entry.accepts_argument("phone") and not result.get("phone"):
        result["phone"] = phone
    if entry and getattr(entry, "sanitize_args", None):
        result = entry.sanitize_args(result)
    return result


def _classify_confirmation_response(text: str) -> str:
    text = str(text or "").strip()
    if not text:
        return "unknown"
    negative_tokens = ["取消", "不用", "不要", "算了", "先不", "不办", "不需要", "停止", "撤销"]
    if any(token in text for token in negative_tokens):
        return "rejected"
    positive_tokens = ["确认", "确定", "同意", "可以", "没问题", "好的", "好", "提交", "下单", "办理"]
    if any(token in text for token in positive_tokens):
        return "approved"
    return "unknown"


def _pending_confirmation_status(agent_state: dict, last_user: dict[str, Any]) -> str:
    pending = agent_state.get("pending_confirmation") or {}
    if not pending:
        return "none"
    if float(last_user.get("created_at", 0) or 0) <= float(pending.get("requested_after_user_at", 0) or 0):
        return "waiting"
    return _classify_confirmation_response(last_user.get("text", ""))


def _args_compatible(current_args: dict, pending_args: dict) -> bool:
    for key, value in (pending_args or {}).items():
        if key in current_args and current_args.get(key) != value:
            return False
    return True


def _pending_confirmation_notice(agent_state: dict, last_user: dict[str, Any]) -> str:
    pending = agent_state.get("pending_confirmation") or {}
    if not pending:
        return ""
    status = _pending_confirmation_status(agent_state, last_user)
    args_text = json.dumps(pending.get("args") or {}, ensure_ascii=False)
    if status == "approved":
        return (
            "<pending-confirmation>\n"
            f"用户已明确确认待执行动作 `{pending.get('tool_name', '')}`。"
            f"请直接继续调用该工具，优先使用这组已确认参数：{args_text}。\n"
            "</pending-confirmation>"
        )
    if status == "rejected":
        return (
            "<pending-confirmation>\n"
            f"用户已明确取消待执行动作 `{pending.get('tool_name', '')}`。"
            "不要执行该工具，请说明已取消并继续处理用户新的请求。\n"
            "</pending-confirmation>"
        )
    return (
        "<pending-confirmation>\n"
        f"当前有一个待确认动作 `{pending.get('tool_name', '')}`，参数为：{args_text}。"
        "在用户明确确认之前，不要执行该动作；请先向用户确认。\n"
        "</pending-confirmation>"
    )


def _confirmation_request_text(name: str, args: dict) -> str:
    summary = []
    if args.get("product_id"):
        summary.append(f"产品ID: {args.get('product_id')}")
    if args.get("order_id"):
        summary.append(f"订单号: {args.get('order_id')}")
    if args.get("pay_mode"):
        summary.append(f"支付方式: {args.get('pay_mode')}")
    details = "；".join(summary) if summary else json.dumps(args, ensure_ascii=False)
    return (
        f"[执行门禁] 工具 {name} 需要用户明确确认，当前尚未执行。\n"
        f"待确认信息：{details}\n"
        "请先向用户确认；只有在用户后续明确回复“确认/确定/同意办理/提交”后，才能再次调用该工具。"
    )


async def _persist_agent_state(db: AsyncSession, session_id: str, agent_state: dict, phone: str = "") -> None:
    payload = {"agent_state": agent_state}
    if phone:
        payload["phone"] = phone
    await crud.update_session_metadata(db, session_id, payload)


def _trim_text(value: Any, limit: int = 240) -> str:
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit]}...(len={len(text)})"


def _workflow_log_snapshot(agent_state: dict) -> dict[str, Any]:
    workflow = (agent_state.get("workflow_state") or {})
    pending = (agent_state.get("pending_confirmation") or {})
    runtime = (agent_state.get("runtime_state") or {})
    return {
        "scenario": str(workflow.get("scenario", "") or "").strip(),
        "phase": str(workflow.get("phase", "") or "").strip(),
        "goal": _trim_text(workflow.get("goal", ""), 160),
        "current_task_id": str(workflow.get("current_task_id", "") or "").strip(),
        "blocked_reason": _trim_text(workflow.get("blocked_reason", ""), 160),
        "next_actions": list(workflow.get("next_actions") or []),
        "pending_tool": str(pending.get("tool_name", "") or "").strip(),
        "pending_fingerprint": str(pending.get("fingerprint", "") or "").strip(),
        "context_budget": dict(runtime.get("context_budget") or {}),
    }


async def _log_agent_event(
    db: AsyncSession,
    session_id: str,
    step: int,
    agent_state: dict,
    category: str,
    event_type: str,
    provider_name: str,
    phone: str,
    summary: str = "",
    status: str = "",
    llm_request_id: str = "",
    tool_name: str = "",
    tool_call_id: str = "",
    payload: dict | None = None,
    latency_ms: int = 0,
) -> None:
    try:
        await crud.add_agent_event_log(
            db=db,
            session_id=session_id,
            step=step,
            category=category,
            event_type=event_type,
            summary=summary,
            status=status,
            provider=provider_name,
            phone=phone,
            llm_request_id=llm_request_id,
            tool_name=tool_name,
            tool_call_id=tool_call_id,
            agent_state=agent_state,
            payload=payload,
            latency_ms=latency_ms,
        )
    except Exception:
        logger.exception("写入 agent_event_log 失败: category=%s event_type=%s", category, event_type)


async def run(
    db: AsyncSession,
    provider: Provider,
    session_id: str,
    skill_name: str = "",
    phone: str = "",
) -> AsyncIterator[Event]:
    step = 0
    compacted = False
    last_tool_policy_warning = ""
    provider_name = str(getattr(provider, "name", "") or provider.__class__.__name__).strip()
    session = await crud.get_session(db, session_id)
    session_metadata = session.metadata_ if session and session.metadata_ else {}
    agent_state = load_agent_state(session_metadata)

    if skill_name:
        set_active_skill(agent_state, skill_name, mode="switch")

    loaded_skills = _load_skills_from_state(agent_state, initial_skill=skill_name)

    if not phone:
        phone = await crud.get_session_phone(db, session_id)

    await ensure_mcp_tools_loaded()
    await _persist_agent_state(db, session_id, agent_state, phone=phone)

    while step < settings.max_steps:
        db_messages = await crud.get_messages(db, session_id)
        raw_messages = rebuild(db_messages)
        messages, context_budget = apply_budget_governance(raw_messages)
        last_user = _latest_user_message(db_messages)

        state_dirty = False
        rejected_pending_snapshot = None
        if context_budget != (((agent_state.get("runtime_state") or {}).get("context_budget") or {})):
            update_context_budget(agent_state, context_budget)
            state_dirty = True
        if last_user.get("text") and (agent_state.get("workflow_state") or {}).get("last_user_message") != last_user.get("text"):
            update_workflow_user_message(agent_state, last_user.get("text", ""))
            state_dirty = True
        if (agent_state.get("runtime_state") or {}).get("last_user_action") != (last_user.get("client_meta") or {}):
            update_runtime_state(agent_state, {"last_user_action": dict(last_user.get("client_meta") or {})})
            state_dirty = True

        pending_status = _pending_confirmation_status(agent_state, last_user)
        if pending_status == "rejected":
            rejected_pending_snapshot = dict(agent_state.get("pending_confirmation") or {})
            clear_pending_confirmation(agent_state)
            update_workflow_state(
                agent_state,
                {"flags": {"awaiting_confirmation": False}},
                history_entry={"kind": "confirmation", "summary": "用户取消了待确认动作"},
            )
            state_dirty = True

        if state_dirty:
            await _persist_agent_state(db, session_id, agent_state, phone=phone)

        if rejected_pending_snapshot:
            await _log_agent_event(
                db,
                session_id=session_id,
                step=step,
                agent_state=agent_state,
                category="confirmation",
                event_type="rejected",
                provider_name=provider_name,
                phone=phone,
                summary=f"用户取消待确认动作 {rejected_pending_snapshot.get('tool_name', '')}",
                status="rejected",
                tool_name=str(rejected_pending_snapshot.get("tool_name", "") or "").strip(),
                tool_call_id=str(rejected_pending_snapshot.get("tool_call_id", "") or "").strip(),
                payload={
                    "pending_confirmation": rejected_pending_snapshot,
                    "last_user_text": _trim_text(last_user.get("text", ""), 240),
                    "workflow": _workflow_log_snapshot(agent_state),
                },
            )

        await _log_agent_event(
            db,
            session_id=session_id,
            step=step,
            agent_state=agent_state,
            category="runtime",
            event_type="step_start",
            provider_name=provider_name,
            phone=phone,
            summary=f"开始执行第 {step + 1} 个 step",
            status="started",
            payload={
                "raw_message_count": len(raw_messages),
                "governed_message_count": len(messages),
                "loaded_skills": [s.name for s in loaded_skills],
                "last_user": {
                    "id": last_user.get("id", ""),
                    "created_at": last_user.get("created_at", 0),
                    "text": _trim_text(last_user.get("text", ""), 240),
                    "client_meta": last_user.get("client_meta", {}),
                },
                "workflow": _workflow_log_snapshot(agent_state),
            },
        )
        if context_budget.get("local_thin_applied"):
            await _log_agent_event(
                db,
                session_id=session_id,
                step=step,
                agent_state=agent_state,
                category="context",
                event_type="local_thin_applied",
                provider_name=provider_name,
                phone=phone,
                summary="已对旧上下文执行局部瘦身",
                status="applied",
                payload={
                    "context_budget": context_budget,
                    "trimmed_tool_messages": context_budget.get("trimmed_tool_messages", 0),
                    "trimmed_assistant_messages": context_budget.get("trimmed_assistant_messages", 0),
                },
            )

        should_compact = needs_compaction(raw_messages) or bool(context_budget.get("should_compact"))
        breaker_open = int((((agent_state.get("runtime_state") or {}).get("compaction_failures", 0)) or 0)) >= 2
        if should_compact and not breaker_open:
            yield Event("status", text="正在压缩对话历史...")
            keep_from_message_id = find_keep_from_message_id(db_messages, settings.summary_keep_recent_turns)
            compaction_started_at = time.perf_counter()
            await _log_agent_event(
                db,
                session_id=session_id,
                step=step,
                agent_state=agent_state,
                category="context",
                event_type="compaction_attempt",
                provider_name=provider_name,
                phone=phone,
                summary="开始执行上下文压缩",
                status="started",
                payload={
                    "keep_from_message_id": keep_from_message_id,
                    "raw_message_count": len(raw_messages),
                    "context_budget": context_budget,
                },
            )
            try:
                summary = await compact(provider, raw_messages, agent_state=agent_state)
            except Exception as e:
                compaction_latency_ms = int((time.perf_counter() - compaction_started_at) * 1000)
                mark_compaction_failure(agent_state, str(e))
                update_workflow_state(
                    agent_state,
                    history_entry={"kind": "compaction_error", "summary": "上下文压缩失败，已回退到局部瘦身"},
                )
                await _persist_agent_state(db, session_id, agent_state, phone=phone)
                await _log_agent_event(
                    db,
                    session_id=session_id,
                    step=step,
                    agent_state=agent_state,
                    category="context",
                    event_type="compaction_failure",
                    provider_name=provider_name,
                    phone=phone,
                    summary="上下文压缩失败，已回退到局部瘦身",
                    status="error",
                    payload={
                        "error": str(e),
                        "context_budget": context_budget,
                        "workflow": _workflow_log_snapshot(agent_state),
                    },
                    latency_ms=compaction_latency_ms,
                )
                yield Event("status", text="上下文压缩失败，已回退到局部瘦身继续处理。")
            else:
                compaction_latency_ms = int((time.perf_counter() - compaction_started_at) * 1000)
                clear_compaction_failure(agent_state)
                metadata = {
                    "layers": ["state", "recent_tools", "summary"],
                    "keep_recent_turns": settings.summary_keep_recent_turns,
                }
                if keep_from_message_id:
                    metadata["keep_from_message_id"] = keep_from_message_id
                await crud.add_message(db, session_id, "user", [
                    {
                        "type": "compaction",
                        "content": summary,
                        "metadata": metadata,
                    }
                ])
                yield Event("summary", text="已完成上下文总结，后续回复将基于压缩摘要继续。")
                update_workflow_state(
                    agent_state,
                    history_entry={"kind": "compaction", "summary": "已执行分层上下文压缩"},
                )
                await _persist_agent_state(db, session_id, agent_state, phone=phone)
                compacted = True
                db_messages = await crud.get_messages(db, session_id)
                raw_messages = rebuild(db_messages)
                messages, context_budget = apply_budget_governance(raw_messages)
                update_context_budget(agent_state, context_budget)
                await _persist_agent_state(db, session_id, agent_state, phone=phone)
                await _log_agent_event(
                    db,
                    session_id=session_id,
                    step=step,
                    agent_state=agent_state,
                    category="context",
                    event_type="compaction_success",
                    provider_name=provider_name,
                    phone=phone,
                    summary="已完成上下文压缩",
                    status="success",
                    payload={
                        "summary_chars": len(summary or ""),
                        "keep_from_message_id": keep_from_message_id,
                        "context_budget_after": context_budget,
                    },
                    latency_ms=compaction_latency_ms,
                )
        elif should_compact and breaker_open:
            context_budget = dict(context_budget or {})
            context_budget["compaction_breaker_open"] = True
            update_context_budget(agent_state, context_budget)
            await _persist_agent_state(db, session_id, agent_state, phone=phone)
            await _log_agent_event(
                db,
                session_id=session_id,
                step=step,
                agent_state=agent_state,
                category="context",
                event_type="compaction_breaker_open",
                provider_name=provider_name,
                phone=phone,
                summary="上下文压缩熔断，回退到局部瘦身",
                status="skipped",
                payload={"context_budget": context_budget},
            )
            yield Event("status", text="上下文压缩暂时熔断，已回退到局部瘦身继续处理。")

        reminder = check_reminders(step, settings.max_steps, compacted)
        if reminder:
            messages.append({"role": "user", "content": reminder})
        pending_notice = _pending_confirmation_notice(agent_state, last_user)
        if pending_notice:
            messages.append({"role": "user", "content": pending_notice})
        compacted = False

        skill_prompts = [s.prompt for s in loaded_skills if s.prompt]
        runtime_controls = {
            "context_budget": context_budget,
            "step": step,
            "max_steps": settings.max_steps,
        }
        if last_tool_policy_warning:
            runtime_controls["tool_policy_warning"] = last_tool_policy_warning
        system = build_system("\n\n".join(skill_prompts), phone=phone, agent_state=agent_state, runtime_controls=runtime_controls)
        tools = _collect_tools(loaded_skills)

        sys_text = "\n\n".join([s for s in system if s]).strip()
        full_request_msgs = ([{"role": "system", "content": sys_text}] if sys_text else []) + messages
        tool_defs_json = [
            {"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.parameters}}
            for t in tools
        ] if tools else []
        request_meta = {
            "raw_message_count": len(raw_messages),
            "governed_message_count": len(messages),
            "system_section_count": len(system),
            "system_chars": len(sys_text),
            "loaded_skills": [s.name for s in loaded_skills],
            "local_thin_applied": bool(context_budget.get("local_thin_applied")),
            "pending_notice_injected": bool(pending_notice),
            "reminder_injected": bool(reminder),
            "tool_policy_warning": _trim_text(last_tool_policy_warning, 200),
        }
        llm_req = await crud.create_llm_request(
            db, session_id, step, provider.model,
            request_messages=full_request_msgs,
            request_tools=tool_defs_json,
            provider=provider_name,
            phone=phone,
            agent_state=agent_state,
            context_budget=context_budget,
            request_meta=request_meta,
        )
        logger.info("[Step %d] LLM请求已存储 id=%s model=%s msgs=%d", step, llm_req.id, provider.model, len(full_request_msgs))
        await _log_agent_event(
            db,
            session_id=session_id,
            step=step,
            agent_state=agent_state,
            category="llm",
            event_type="request_prepared",
            provider_name=provider_name,
            phone=phone,
            summary=f"已准备 LLM 请求 {llm_req.id}",
            status="started",
            llm_request_id=llm_req.id,
            payload={
                "request_message_count": len(full_request_msgs),
                "tool_count": len(tool_defs_json),
                "request_meta": request_meta,
                "workflow": _workflow_log_snapshot(agent_state),
            },
        )

        text_buf = ""
        thinking_buf = ""
        tool_calls = []
        input_tokens = 0
        output_tokens = 0
        llm_started_at = time.perf_counter()
        provider_error_text = ""

        async for event in provider.stream(system, messages, tools):
            if event.type == "thinking_delta":
                thinking_buf += event.content
                yield Event("thinking_delta", content=event.content)

            elif event.type == "text_delta":
                text_buf += event.content
                yield Event("text_delta", content=event.content)

            elif event.type == "tool_call":
                tool_calls.append(event.tool_call)

            elif event.type == "finish":
                input_tokens, output_tokens = event.tokens

            elif event.type == "error":
                provider_error_text = event.content
                break

        response_raw = {"text": text_buf}
        if thinking_buf:
            response_raw["thinking"] = thinking_buf
        if tool_calls:
            response_raw["tool_calls"] = tool_calls
        if provider_error_text:
            response_raw["error"] = provider_error_text
        llm_latency_ms = int((time.perf_counter() - llm_started_at) * 1000)
        await crud.update_llm_response(
            db, llm_req.id,
            response=response_raw,
            token_input=input_tokens,
            token_output=output_tokens,
            status="error" if provider_error_text else "completed",
            error_text=provider_error_text,
            finish_reason="error" if provider_error_text else ("tool_calls" if tool_calls else "stop"),
            latency_ms=llm_latency_ms,
            response_meta={
                "raw_tool_call_count": len(tool_calls),
                "thinking_chars": len(thinking_buf),
                "text_chars": len(text_buf),
                "context_budget": context_budget,
            },
        )

        if provider_error_text:
            await _log_agent_event(
                db,
                session_id=session_id,
                step=step,
                agent_state=agent_state,
                category="llm",
                event_type="provider_error",
                provider_name=provider_name,
                phone=phone,
                summary="LLM Provider 返回错误",
                status="error",
                llm_request_id=llm_req.id,
                payload={
                    "error": provider_error_text,
                    "workflow": _workflow_log_snapshot(agent_state),
                },
                latency_ms=llm_latency_ms,
            )
            yield Event("error", text=provider_error_text)
            await crud.add_message(db, session_id, "assistant", [
                {"type": "text", "content": f"[错误] {provider_error_text}"}
            ], model=provider.model)
            return

        if tool_calls:
            seen = set()
            merged = []
            for tc in tool_calls:
                key = tc.get("id") or f"{tc.get('name', '')}:{tc.get('arguments', '')}"
                if key not in seen:
                    seen.add(key)
                    merged.append(tc)
            tool_calls = merged[:1]
            if tool_calls and not tool_calls[0].get("id"):
                raw = f"{tool_calls[0].get('name', '')}:{tool_calls[0].get('arguments', '')}"
                tool_calls[0]["id"] = f"call_{hashlib.md5(raw.encode()).hexdigest()[:12]}"
            await _log_agent_event(
                db,
                session_id=session_id,
                step=step,
                agent_state=agent_state,
                category="llm",
                event_type="tool_selected",
                provider_name=provider_name,
                phone=phone,
                summary=f"模型选择工具 {tool_calls[0].get('name', '')}",
                status="selected",
                llm_request_id=llm_req.id,
                tool_name=str(tool_calls[0].get("name", "") or "").strip(),
                tool_call_id=str(tool_calls[0].get("id", "") or "").strip(),
                payload={
                    "arguments_preview": _trim_text(tool_calls[0].get("arguments", ""), 240),
                    "raw_tool_call_count": len(response_raw.get("tool_calls") or []),
                },
            )
            yield Event("tool_call", tool=tool_calls[0])

        parts = []
        if thinking_buf:
            parts.append({"type": "thinking", "content": thinking_buf})
        if text_buf:
            parts.append({"type": "text", "content": text_buf})
        if tool_calls:
            parts.append({
                "type": "tool_call",
                "content": json.dumps(tool_calls[0], ensure_ascii=False),
                "metadata": {
                    "llm_request_id": llm_req.id,
                    "tool_call_id": tool_calls[0]["id"],
                    "tool_name": str(tool_calls[0].get("name", "") or "").strip(),
                },
            })
        assistant_msg = None
        if parts:
            assistant_msg = await crud.add_message(
                db, session_id, "assistant", parts,
                model=provider.model,
                tokens=(input_tokens, output_tokens),
            )

        await _log_agent_event(
            db,
            session_id=session_id,
            step=step,
            agent_state=agent_state,
            category="llm",
            event_type="response_ready",
            provider_name=provider_name,
            phone=phone,
            summary="LLM 已返回响应",
            status="completed",
            llm_request_id=llm_req.id,
            payload={
                "assistant_message_id": getattr(assistant_msg, "id", "") if assistant_msg else "",
                "text_chars": len(text_buf),
                "thinking_chars": len(thinking_buf),
                "tool_call_count": len(tool_calls),
                "tool_calls": [
                    {
                        "id": str(item.get("id", "") or "").strip(),
                        "name": str(item.get("name", "") or "").strip(),
                        "arguments_preview": _trim_text(item.get("arguments", ""), 240),
                    }
                    for item in tool_calls
                ],
            },
            latency_ms=llm_latency_ms,
        )

        if not tool_calls:
            await _log_agent_event(
                db,
                session_id=session_id,
                step=step,
                agent_state=agent_state,
                category="runtime",
                event_type="reply_completed",
                provider_name=provider_name,
                phone=phone,
                summary="本 step 未触发工具，直接完成回复",
                status="completed",
                llm_request_id=llm_req.id,
                payload={
                    "assistant_message_id": getattr(assistant_msg, "id", "") if assistant_msg else "",
                    "text_preview": _trim_text(text_buf, 240),
                },
            )
            yield Event("done")
            return

        tc = tool_calls[0]
        name = tc["name"]
        tc_id = tc.get("id", "")
        entry = get_tool(name)
        args = enrich_tool_args(entry, parse_args(tc.get("arguments", "")), agent_state, phone=phone) if entry else _normalize_tool_args(parse_args(tc.get("arguments", "")), phone)
        result_text = f"未知工具: {name}"
        tool_result_status = "unknown"
        tool_latency_ms = 0
        fingerprint = ""
        policy_reason_code = ""
        emitted_card_ids: list[str] = []

        if not entry:
            tool_result_status = "unknown_tool"
            await _log_agent_event(
                db,
                session_id=session_id,
                step=step,
                agent_state=agent_state,
                category="tool",
                event_type="unknown_tool",
                provider_name=provider_name,
                phone=phone,
                summary=f"模型请求了未注册工具 {name}",
                status="error",
                llm_request_id=llm_req.id,
                tool_name=name,
                tool_call_id=tc_id,
                payload={
                    "tool_call": tc,
                    "args": args,
                },
            )
            yield Event("tool_result", tool=name, tool_call_id=tc_id, text=result_text, error=True)
        else:
            decision = evaluate_tool_policy(entry, args, agent_state)
            exec_args = dict(decision.resolved_args or args)
            fingerprint = str(decision.fingerprint or "").strip()
            confirmation_approved = False
            state_dirty = False
            allow_execute = decision.allow
            pending = agent_state.get("pending_confirmation") or {}
            pending_status = _pending_confirmation_status(agent_state, last_user)

            if not decision.allow:
                tool_result_status = "blocked"
                policy_reason_code = str(decision.reason_code or "").strip()
                result_text = decision.message or f"[Tool Policy] 工具 {name} 当前不允许执行。"
                if decision.workflow_patch or decision.history_entry:
                    update_workflow_state(agent_state, decision.workflow_patch or {}, history_entry=decision.history_entry or None)
                    state_dirty = True
                last_tool_policy_warning = decision.reason or result_text
                if state_dirty:
                    await _persist_agent_state(db, session_id, agent_state, phone=phone)
                await _log_agent_event(
                    db,
                    session_id=session_id,
                    step=step,
                    agent_state=agent_state,
                    category="tool_policy",
                    event_type="blocked",
                    provider_name=provider_name,
                    phone=phone,
                    summary=f"工具 {name} 被策略阻止",
                    status="blocked",
                    llm_request_id=llm_req.id,
                    tool_name=name,
                    tool_call_id=tc_id,
                    payload={
                        "reason_code": decision.reason_code,
                        "reason": decision.reason,
                        "fallback_tool": decision.fallback_tool,
                        "resolved_args": exec_args,
                        "workflow": _workflow_log_snapshot(agent_state),
                    },
                )
                yield Event("tool_result", tool=name, tool_call_id=tc_id, text=result_text)

            elif decision.requires_confirmation:
                same_pending = (
                    pending.get("tool_name") == name
                    and pending_status == "approved"
                    and _args_compatible(exec_args, pending.get("args") or {})
                    and (not fingerprint or not pending.get("fingerprint") or pending.get("fingerprint") == fingerprint)
                )
                if same_pending:
                    confirmation_approved = True
                    exec_args = dict(pending.get("args") or exec_args)
                    clear_pending_confirmation(agent_state)
                    update_workflow_state(
                        agent_state,
                        {"phase": "confirmation_approved", "flags": {"awaiting_confirmation": False}, "blocked_reason": "", "blocked_by": "", "next_actions": []},
                        history_entry={"kind": "confirmation", "summary": f"用户已确认执行 {name}"},
                    )
                    state_dirty = True
                else:
                    tool_result_status = "awaiting_confirmation"
                    allow_execute = False
                    result_text = _confirmation_request_text(name, exec_args)
                    set_pending_confirmation(
                        agent_state,
                        tool_name=name,
                        args=exec_args,
                        tool_call_id=tc_id,
                        user_message_id=last_user.get("id", ""),
                        user_message_at=last_user.get("created_at", 0),
                        summary=result_text,
                        policy_snapshot=entry.policy_snapshot(),
                        fingerprint=fingerprint,
                    )
                    update_workflow_state(
                        agent_state,
                        {"phase": "awaiting_user_confirmation", "flags": {"awaiting_confirmation": True}, "blocked_reason": "", "blocked_by": "", "next_actions": []},
                        history_entry={"kind": "confirmation_request", "summary": f"已请求用户确认执行 {name}"},
                    )
                    state_dirty = True
                    last_tool_policy_warning = ""
                    await _persist_agent_state(db, session_id, agent_state, phone=phone)
                    await _log_agent_event(
                        db,
                        session_id=session_id,
                        step=step,
                        agent_state=agent_state,
                        category="confirmation",
                        event_type="requested",
                        provider_name=provider_name,
                        phone=phone,
                        summary=f"已请求用户确认执行 {name}",
                        status="awaiting_confirmation",
                        llm_request_id=llm_req.id,
                        tool_name=name,
                        tool_call_id=tc_id,
                        payload={
                            "exec_args": exec_args,
                            "fingerprint": fingerprint,
                            "workflow": _workflow_log_snapshot(agent_state),
                        },
                    )
                    yield Event("tool_result", tool=name, tool_call_id=tc_id, text=result_text)

            if allow_execute:
                if entry.policy.external_side_effect:
                    update_workflow_state(
                        agent_state,
                        {"phase": "submitting", "blocked_reason": "", "blocked_by": "", "next_actions": []},
                        history_entry={"kind": "tool_execution", "summary": f"准备执行外部业务动作 {name}"},
                    )
                    state_dirty = True
                if state_dirty:
                    await _persist_agent_state(db, session_id, agent_state, phone=phone)
                    state_dirty = False
                if confirmation_approved:
                    await _log_agent_event(
                        db,
                        session_id=session_id,
                        step=step,
                        agent_state=agent_state,
                        category="confirmation",
                        event_type="approved",
                        provider_name=provider_name,
                        phone=phone,
                        summary=f"用户已确认执行 {name}",
                        status="approved",
                        llm_request_id=llm_req.id,
                        tool_name=name,
                        tool_call_id=tc_id,
                        payload={
                            "exec_args": exec_args,
                            "fingerprint": fingerprint,
                        },
                    )
                await _log_agent_event(
                    db,
                    session_id=session_id,
                    step=step,
                    agent_state=agent_state,
                    category="tool",
                    event_type="execute_start",
                    provider_name=provider_name,
                    phone=phone,
                    summary=f"开始执行工具 {name}",
                    status="started",
                    llm_request_id=llm_req.id,
                    tool_name=name,
                    tool_call_id=tc_id,
                    payload={
                        "exec_args": exec_args,
                        "fingerprint": fingerprint,
                        "policy": entry.policy_snapshot(),
                        "workflow": _workflow_log_snapshot(agent_state),
                    },
                )
                yield Event("tool_executing", tool=name, tool_call_id=tc_id)
                tool_started_at = time.perf_counter()
                result = await entry.execute(exec_args)
                tool_latency_ms = int((time.perf_counter() - tool_started_at) * 1000)
                logger.info(
                    "[Tool] %s(%s) → %s",
                    name,
                    json.dumps(exec_args, ensure_ascii=False),
                    result.text[:500] if result.text else "(empty)",
                )

                if result.error:
                    tool_result_status = "error"
                    result_text = f"[工具错误] {result.error}"
                    update_workflow_state(
                        agent_state,
                        {"blocked_reason": result.error, "blocked_by": name, "next_actions": ["向用户说明失败原因", "如需重试请补齐条件后再试"]},
                        history_entry={"kind": "tool_error", "summary": f"{name} 执行失败"},
                    )
                    if fingerprint:
                        record_tool_execution(agent_state, name, fingerprint, exec_args, status="error", summary=result.error[:120])
                    await _persist_agent_state(db, session_id, agent_state, phone=phone)
                    await _log_agent_event(
                        db,
                        session_id=session_id,
                        step=step,
                        agent_state=agent_state,
                        category="tool",
                        event_type="execute_error",
                        provider_name=provider_name,
                        phone=phone,
                        summary=f"工具 {name} 执行失败",
                        status="error",
                        llm_request_id=llm_req.id,
                        tool_name=name,
                        tool_call_id=tc_id,
                        payload={
                            "exec_args": exec_args,
                            "fingerprint": fingerprint,
                            "error": result.error,
                            "workflow": _workflow_log_snapshot(agent_state),
                        },
                        latency_ms=tool_latency_ms,
                    )
                    yield Event("tool_result", tool=name, tool_call_id=tc_id, text=result_text, error=True)
                else:
                    tool_result_status = "success"
                    update_workflow_state(agent_state, {"blocked_reason": "", "blocked_by": "", "next_actions": []})
                    workflow_patch = result.metadata.get("workflow_patch")
                    workflow_history = result.metadata.get("workflow_history")
                    if workflow_patch or workflow_history:
                        update_workflow_state(agent_state, workflow_patch or {}, history_entry=workflow_history)
                        state_dirty = True

                    skill_loaded_name = result.metadata.get("_skill_loaded")
                    skill_mode = str(result.metadata.get("_skill_mode") or "switch").strip().lower() or "switch"
                    if skill_loaded_name:
                        set_active_skill(agent_state, skill_loaded_name, mode=skill_mode)
                        update_workflow_state(
                            agent_state,
                            {"scenario": skill_loaded_name, "phase": "intent_collected", "blocked_reason": "", "blocked_by": "", "next_actions": []},
                            history_entry={"kind": "load_skills", "summary": f"已加载技能 {skill_loaded_name}（{skill_mode}）"},
                        )
                        loaded_skills = _load_skills_from_state(agent_state)
                        logger.info(
                            "[Skill] 动态加载技能: %s mode=%s active=%s",
                            skill_loaded_name,
                            skill_mode,
                            (agent_state.get("skill_state") or {}).get("active_skills", []),
                        )
                        yield Event("status", text=f"已加载技能: {skill_loaded_name}")
                        state_dirty = True
                        await _log_agent_event(
                            db,
                            session_id=session_id,
                            step=step,
                            agent_state=agent_state,
                            category="skill",
                            event_type="loaded",
                            provider_name=provider_name,
                            phone=phone,
                            summary=f"已加载技能 {skill_loaded_name}",
                            status="success",
                            llm_request_id=llm_req.id,
                            tool_name=name,
                            tool_call_id=tc_id,
                            payload={"mode": skill_mode},
                        )

                    if fingerprint:
                        summary_text = ""
                        if isinstance(workflow_history, dict):
                            summary_text = str(workflow_history.get("summary", "") or "").strip()
                        elif isinstance(workflow_history, str):
                            summary_text = workflow_history.strip()
                        if not summary_text:
                            summary_text = (result.text or "")[:120]
                        record_tool_execution(agent_state, name, fingerprint, exec_args, status="success", summary=summary_text)
                        state_dirty = True

                    if state_dirty:
                        await _persist_agent_state(db, session_id, agent_state, phone=phone)

                    last_tool_policy_warning = ""
                    result_text = result.text
                    card = result.metadata.get("card")
                    cards = result.metadata.get("cards")
                    if card:
                        cid = _card_id(name, exec_args)
                        emitted_card_ids.append(cid)
                        result_text += f"\n\n_card_id: {cid}"
                        yield Event("card", card_id=cid, card=card, tool_call_id=tc_id)
                    if isinstance(cards, list):
                        for idx, item in enumerate(cards):
                            if isinstance(item, dict) and "card" in item:
                                payload = item.get("card")
                                suffix = item.get("suffix", "")
                            else:
                                payload = item
                                suffix = ""
                            if not isinstance(payload, dict):
                                continue
                            cid = _card_id(name, exec_args, suffix or payload.get("type", f"card_{idx + 1}"))
                            emitted_card_ids.append(cid)
                            result_text += f"\n\n_card_id: {cid}"
                            yield Event("card", card_id=cid, card=payload, tool_call_id=tc_id)
                    await _log_agent_event(
                        db,
                        session_id=session_id,
                        step=step,
                        agent_state=agent_state,
                        category="tool",
                        event_type="execute_success",
                        provider_name=provider_name,
                        phone=phone,
                        summary=f"工具 {name} 执行成功",
                        status="success",
                        llm_request_id=llm_req.id,
                        tool_name=name,
                        tool_call_id=tc_id,
                        payload={
                            "exec_args": exec_args,
                            "fingerprint": fingerprint,
                            "emitted_card_ids": emitted_card_ids,
                            "workflow_patch": workflow_patch,
                            "workflow_history": workflow_history,
                            "skill_loaded_name": skill_loaded_name,
                            "result_preview": _trim_text(result.text, 240),
                        },
                        latency_ms=tool_latency_ms,
                    )
                    yield Event("tool_result", tool=name, tool_call_id=tc_id, text=result_text)

        if assistant_msg is not None:
            await crud.add_part(
                db,
                mid=assistant_msg.id,
                sid=session_id,
                ptype="tool_result",
                content=result_text if entry else f"未知工具: {name}",
                metadata={
                    "llm_request_id": llm_req.id,
                    "tool_call_id": tc_id,
                    "tool_name": name,
                    "tool_status": tool_result_status,
                    "fingerprint": fingerprint,
                    "latency_ms": tool_latency_ms,
                    "policy_reason_code": policy_reason_code,
                    "card_ids": emitted_card_ids,
                },
                index=len(assistant_msg.parts),
            )

        await _log_agent_event(
            db,
            session_id=session_id,
            step=step,
            agent_state=agent_state,
            category="runtime",
            event_type="step_end",
            provider_name=provider_name,
            phone=phone,
            summary=f"第 {step + 1} 个 step 结束",
            status=tool_result_status if tool_calls else "completed",
            llm_request_id=llm_req.id,
            tool_name=name,
            tool_call_id=tc_id,
            payload={
                "assistant_message_id": getattr(assistant_msg, "id", "") if assistant_msg else "",
                "tool_status": tool_result_status,
                "tool_latency_ms": tool_latency_ms,
                "policy_reason_code": policy_reason_code,
                "card_ids": emitted_card_ids,
                "workflow": _workflow_log_snapshot(agent_state),
            },
        )

        step += 1

    await _log_agent_event(
        db,
        session_id=session_id,
        step=step,
        agent_state=agent_state,
        category="runtime",
        event_type="max_steps_reached",
        provider_name=provider_name,
        phone=phone,
        summary=f"达到最大执行步数 {settings.max_steps}",
        status="stopped",
        payload={"max_steps": settings.max_steps},
    )
    yield Event("max_steps", text=f"已达到最大执行步数({settings.max_steps})，对话暂停。")
    yield Event("done")
