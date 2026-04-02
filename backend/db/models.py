import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, Float, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from db.engine import Base


def gen_id() -> str:
    return uuid.uuid4().hex[:16]


class SessionModel(Base):
    __tablename__ = "session"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=gen_id)
    title: Mapped[str] = mapped_column(String(256), default="")
    created_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())
    updated_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, default=None)

    messages: Mapped[list["MessageModel"]] = relationship(back_populates="session", cascade="all, delete-orphan", order_by="MessageModel.created_at")


class MessageModel(Base):
    __tablename__ = "message"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=gen_id)
    session_id: Mapped[str] = mapped_column(String(32), ForeignKey("session.id"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # user / assistant / system
    agent: Mapped[str] = mapped_column(String(64), default="default")
    model: Mapped[str] = mapped_column(String(128), default="")
    created_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())
    token_input: Mapped[int] = mapped_column(Integer, default=0)
    token_output: Mapped[int] = mapped_column(Integer, default=0)

    session: Mapped["SessionModel"] = relationship(back_populates="messages")
    parts: Mapped[list["PartModel"]] = relationship(back_populates="message", cascade="all, delete-orphan", order_by="PartModel.index")


class PartModel(Base):
    __tablename__ = "part"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=gen_id)
    message_id: Mapped[str] = mapped_column(String(32), ForeignKey("message.id"), index=True)
    session_id: Mapped[str] = mapped_column(String(32), ForeignKey("session.id"), index=True)
    index: Mapped[int] = mapped_column(Integer, default=0)
    type: Mapped[str] = mapped_column(String(32))  # text / tool_call / tool_result / card / compaction / file
    content: Mapped[str] = mapped_column(Text, default="")
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, default=None)

    message: Mapped["MessageModel"] = relationship(back_populates="parts")


class LLMRequestModel(Base):
    """记录每次请求大模型的完整上下文（原始请求 + 原始响应）"""
    __tablename__ = "llm_request"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=gen_id)
    session_id: Mapped[str] = mapped_column(String(32), ForeignKey("session.id"), index=True)
    step: Mapped[int] = mapped_column(Integer, default=0)
    provider: Mapped[str] = mapped_column(String(64), default="")
    model: Mapped[str] = mapped_column(String(128), default="")
    phone: Mapped[str] = mapped_column(String(32), default="")
    active_skill: Mapped[str] = mapped_column(String(128), default="")
    active_skills_json: Mapped[str] = mapped_column(Text, default="[]")
    workflow_scenario: Mapped[str] = mapped_column(String(64), default="")
    workflow_phase: Mapped[str] = mapped_column(String(64), default="")
    workflow_goal: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="started")
    request_message_count: Mapped[int] = mapped_column(Integer, default=0)
    request_user_turns: Mapped[int] = mapped_column(Integer, default=0)
    request_estimated_tokens: Mapped[int] = mapped_column(Integer, default=0)
    request_tool_count: Mapped[int] = mapped_column(Integer, default=0)
    request_context_budget_json: Mapped[str] = mapped_column(Text, default="{}")
    request_meta_json: Mapped[str] = mapped_column(Text, default="{}")
    # 发给大模型的原始请求：完整 messages 列表 JSON（含 system/user/assistant/tool）
    request_messages_json: Mapped[str] = mapped_column(Text, default="")
    # 可用工具定义 JSON
    request_tools_json: Mapped[str] = mapped_column(Text, default="")
    # 大模型返回的原始响应 JSON：{ "text": "...", "thinking": "...", "tool_calls": [...] }
    response_json: Mapped[str] = mapped_column(Text, default="")
    response_finish_reason: Mapped[str] = mapped_column(String(64), default="")
    response_text_chars: Mapped[int] = mapped_column(Integer, default=0)
    response_thinking_chars: Mapped[int] = mapped_column(Integer, default=0)
    response_tool_call_count: Mapped[int] = mapped_column(Integer, default=0)
    response_tool_names_json: Mapped[str] = mapped_column(Text, default="[]")
    response_meta_json: Mapped[str] = mapped_column(Text, default="{}")
    error_text: Mapped[str] = mapped_column(Text, default="")
    token_input: Mapped[int] = mapped_column(Integer, default=0)
    token_output: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())
    completed_at: Mapped[float] = mapped_column(Float, default=0)


class AgentEventLogModel(Base):
    __tablename__ = "agent_event_log"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=gen_id)
    session_id: Mapped[str] = mapped_column(String(32), ForeignKey("session.id"), index=True)
    llm_request_id: Mapped[str] = mapped_column(String(32), default="", index=True)
    step: Mapped[int] = mapped_column(Integer, default=0)
    provider: Mapped[str] = mapped_column(String(64), default="")
    phone: Mapped[str] = mapped_column(String(32), default="")
    category: Mapped[str] = mapped_column(String(32), default="")
    event_type: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str] = mapped_column(String(32), default="")
    active_skill: Mapped[str] = mapped_column(String(128), default="")
    active_skills_json: Mapped[str] = mapped_column(Text, default="[]")
    workflow_scenario: Mapped[str] = mapped_column(String(64), default="")
    workflow_phase: Mapped[str] = mapped_column(String(64), default="")
    tool_name: Mapped[str] = mapped_column(String(128), default="")
    tool_call_id: Mapped[str] = mapped_column(String(64), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())
