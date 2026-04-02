import json
from copy import deepcopy
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from db.models import SessionModel, MessageModel, PartModel, LLMRequestModel, AgentEventLogModel, gen_id


async def create_session(db: AsyncSession, title: str = "") -> SessionModel:
    session = SessionModel(id=gen_id(), title=title)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def get_session(db: AsyncSession, sid: str) -> SessionModel | None:
    return await db.get(SessionModel, sid)


async def list_sessions(db: AsyncSession) -> list[SessionModel]:
    result = await db.execute(select(SessionModel).order_by(SessionModel.created_at.desc()))
    return list(result.scalars().all())


async def get_messages(db: AsyncSession, sid: str) -> list[MessageModel]:
    # 清除 identity map 缓存，确保重新加载（add_part 追加的 tool_result 才能被看到）
    db.expire_all()
    result = await db.execute(
        select(MessageModel)
        .where(MessageModel.session_id == sid)
        .options(selectinload(MessageModel.parts))
        .order_by(MessageModel.created_at)
    )
    return list(result.scalars().all())


async def add_message(db: AsyncSession, sid: str, role: str, parts: list[dict], agent: str = "default", model: str = "", tokens: tuple[int, int] = (0, 0)) -> MessageModel:
    msg = MessageModel(
        id=gen_id(),
        session_id=sid,
        role=role,
        agent=agent,
        model=model,
        token_input=tokens[0],
        token_output=tokens[1],
    )
    db.add(msg)
    await db.flush()
    for i, p in enumerate(parts):
        content = p.get("content", "")
        if isinstance(content, dict):
            content = json.dumps(content, ensure_ascii=False)
        part = PartModel(
            id=gen_id(),
            message_id=msg.id,
            session_id=sid,
            index=i,
            type=p["type"],
            content=content,
            metadata_=p.get("metadata"),
        )
        db.add(part)
    await db.commit()
    await db.refresh(msg, ["parts"])
    return msg


async def update_message_tokens(db: AsyncSession, mid: str, input_tokens: int, output_tokens: int):
    msg = await db.get(MessageModel, mid)
    if msg:
        msg.token_input = input_tokens
        msg.token_output = output_tokens
        await db.commit()


async def add_part(db: AsyncSession, mid: str, sid: str, ptype: str, content: str, metadata: dict | None = None, index: int = 0) -> PartModel:
    part = PartModel(
        id=gen_id(),
        message_id=mid,
        session_id=sid,
        index=index,
        type=ptype,
        content=content,
        metadata_=metadata,
    )
    db.add(part)
    await db.commit()
    await db.refresh(part)
    return part


async def update_session_metadata(db: AsyncSession, sid: str, metadata: dict) -> None:
    """更新 session 的 metadata（合并而非覆盖）"""
    session = await db.get(SessionModel, sid)
    if session:
        existing = deepcopy(session.metadata_ or {})
        existing.update(deepcopy(metadata))
        session.metadata_ = existing
        await db.commit()


async def get_session_phone(db: AsyncSession, sid: str) -> str:
    """获取 session 绑定的手机号"""
    session = await db.get(SessionModel, sid)
    if session and session.metadata_:
        return session.metadata_.get("phone", "")
    return ""


async def create_llm_request(
    db: AsyncSession,
    session_id: str,
    step: int,
    model: str,
    request_messages: list[dict],
    request_tools: list | None = None,
    provider: str = "",
    phone: str = "",
    agent_state: dict | None = None,
    context_budget: dict | None = None,
    request_meta: dict | None = None,
) -> LLMRequestModel:
    """在调用 LLM 之前，记录发给大模型的完整原始请求（含 system/user/assistant/tool 消息列表）。"""
    skill_state = (agent_state or {}).get("skill_state") or {}
    workflow_state = (agent_state or {}).get("workflow_state") or {}
    rec = LLMRequestModel(
        id=gen_id(),
        session_id=session_id,
        step=step,
        provider=str(provider or "").strip(),
        model=model,
        phone=str(phone or "").strip(),
        active_skill=str(skill_state.get("active_skill", "") or "").strip(),
        active_skills_json=_json_dumps(skill_state.get("active_skills") or []),
        workflow_scenario=str(workflow_state.get("scenario", "") or "").strip(),
        workflow_phase=str(workflow_state.get("phase", "") or "").strip(),
        workflow_goal=str(workflow_state.get("goal", "") or "").strip(),
        status="started",
        request_message_count=len(request_messages or []),
        request_user_turns=_count_request_user_turns(request_messages or []),
        request_estimated_tokens=_estimate_messages_tokens(request_messages or []),
        request_tool_count=len(request_tools or []),
        request_context_budget_json=_json_dumps(context_budget or {}),
        request_meta_json=_json_dumps(request_meta or {}),
        request_messages_json=json.dumps(request_messages, ensure_ascii=False, default=str),
        request_tools_json=json.dumps(request_tools or [], ensure_ascii=False, default=str),
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    return rec


async def update_llm_response(
    db: AsyncSession,
    req_id: str,
    response: dict,
    token_input: int = 0,
    token_output: int = 0,
    status: str = "completed",
    error_text: str = "",
    finish_reason: str = "",
    latency_ms: int = 0,
    response_meta: dict | None = None,
) -> None:
    """LLM 响应完成后，更新大模型返回的原始内容和 token 用量。"""
    rec = await db.get(LLMRequestModel, req_id)
    if rec:
        tool_calls = response.get("tool_calls") or []
        tool_names = [str(item.get("name", "")).strip() for item in tool_calls if isinstance(item, dict) and str(item.get("name", "")).strip()]
        rec.response_json = json.dumps(response, ensure_ascii=False, default=str)
        rec.status = str(status or "completed").strip() or "completed"
        rec.error_text = str(error_text or "").strip()
        rec.response_finish_reason = str(finish_reason or "").strip()
        rec.response_text_chars = len(str(response.get("text", "") or ""))
        rec.response_thinking_chars = len(str(response.get("thinking", "") or ""))
        rec.response_tool_call_count = len(tool_calls)
        rec.response_tool_names_json = _json_dumps(tool_names)
        rec.response_meta_json = _json_dumps(response_meta or {})
        rec.token_input = token_input
        rec.token_output = token_output
        rec.latency_ms = max(int(latency_ms or 0), 0)
        rec.completed_at = datetime.now().timestamp()
        await db.commit()


async def add_agent_event_log(
    db: AsyncSession,
    session_id: str,
    step: int,
    category: str,
    event_type: str,
    summary: str = "",
    status: str = "",
    provider: str = "",
    phone: str = "",
    llm_request_id: str = "",
    tool_name: str = "",
    tool_call_id: str = "",
    agent_state: dict | None = None,
    payload: dict | None = None,
    latency_ms: int = 0,
) -> AgentEventLogModel:
    skill_state = (agent_state or {}).get("skill_state") or {}
    workflow_state = (agent_state or {}).get("workflow_state") or {}
    rec = AgentEventLogModel(
        id=gen_id(),
        session_id=session_id,
        llm_request_id=str(llm_request_id or "").strip(),
        step=step,
        provider=str(provider or "").strip(),
        phone=str(phone or "").strip(),
        category=str(category or "").strip(),
        event_type=str(event_type or "").strip(),
        status=str(status or "").strip(),
        active_skill=str(skill_state.get("active_skill", "") or "").strip(),
        active_skills_json=_json_dumps(skill_state.get("active_skills") or []),
        workflow_scenario=str(workflow_state.get("scenario", "") or "").strip(),
        workflow_phase=str(workflow_state.get("phase", "") or "").strip(),
        tool_name=str(tool_name or "").strip(),
        tool_call_id=str(tool_call_id or "").strip(),
        summary=str(summary or "").strip(),
        payload_json=_json_dumps(payload or {}),
        latency_ms=max(int(latency_ms or 0), 0),
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    return rec


def _json_dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def _count_request_user_turns(messages: list[dict]) -> int:
    total = 0
    for item in messages or []:
        if str(item.get("role", "") or "").strip() != "user":
            continue
        content = item.get("content", "")
        if isinstance(content, str) and content.strip():
            total += 1
        elif isinstance(content, list) and content:
            total += 1
    return total


def _estimate_messages_tokens(messages: list[dict]) -> int:
    total = 0
    for item in messages or []:
        content = item.get("content", "")
        if isinstance(content, str):
            total += len(content)
        elif isinstance(content, list):
            total += len(_json_dumps(content))
        for tool_call in item.get("tool_calls") or []:
            if not isinstance(tool_call, dict):
                continue
            function = tool_call.get("function") or {}
            total += len(str(function.get("arguments", "") or ""))
    return total // 2





