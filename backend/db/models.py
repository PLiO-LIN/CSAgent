import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, Float, ForeignKey, JSON, Boolean
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


class PlatformToolModel(Base):
    __tablename__ = "platform_tool"

    tool_name: Mapped[str] = mapped_column(String(128), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(256), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    provider_type: Mapped[str] = mapped_column(String(32), default="local")
    source_ref: Mapped[str] = mapped_column(String(256), default="")
    scope: Mapped[str] = mapped_column(String(16), default="skill")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    supports_card: Mapped[bool] = mapped_column(Boolean, default=False)
    card_type: Mapped[str] = mapped_column(String(64), default="")
    input_schema: Mapped[dict | None] = mapped_column(JSON, default=None)
    output_schema: Mapped[dict | None] = mapped_column(JSON, default=None)
    policy: Mapped[dict | None] = mapped_column(JSON, default=None)
    card_binding: Mapped[dict | None] = mapped_column(JSON, default=None)
    transport_config: Mapped[dict | None] = mapped_column(JSON, default=None)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, default=None)
    created_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())
    updated_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())


class PlatformSkillModel(Base):
    __tablename__ = "platform_skill"

    skill_name: Mapped[str] = mapped_column(String(128), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(256), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    document_md: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    tool_names: Mapped[list | None] = mapped_column(JSON, default=None)
    global_tool_names: Mapped[list | None] = mapped_column(JSON, default=None)
    card_types: Mapped[list | None] = mapped_column(JSON, default=None)
    entry_intents: Mapped[list | None] = mapped_column(JSON, default=None)
    phases: Mapped[list | None] = mapped_column(JSON, default=None)
    source_type: Mapped[str] = mapped_column(String(32), default="seed")
    source_ref: Mapped[str] = mapped_column(String(256), default="")
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, default=None)
    created_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())
    updated_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())


class PlatformAgentModel(Base):
    __tablename__ = "platform_agent"

    agent_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    system_core_prompt: Mapped[str] = mapped_column(Text, default="")
    persona_prompt: Mapped[str] = mapped_column(Text, default="")
    skill_guide_prompt: Mapped[str] = mapped_column(Text, default="")
    summary_prompt: Mapped[str] = mapped_column(Text, default="")
    memory_prompt: Mapped[str] = mapped_column(Text, default="")
    global_tool_names: Mapped[list | None] = mapped_column(JSON, default=None)
    skill_names: Mapped[list | None] = mapped_column(JSON, default=None)
    model_config: Mapped[dict | None] = mapped_column(JSON, default=None)
    tool_policy_config: Mapped[dict | None] = mapped_column(JSON, default=None)
    memory_config: Mapped[dict | None] = mapped_column(JSON, default=None)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, default=None)
    created_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())
    updated_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())


class PlatformAgentApiKeyModel(Base):
    __tablename__ = "platform_agent_api_key"

    key_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    agent_id: Mapped[str] = mapped_column(String(128), index=True)
    name: Mapped[str] = mapped_column(String(256), default="")
    key_prefix: Mapped[str] = mapped_column(String(32), default="")
    key_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_used_at: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())
    updated_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())


class PlatformCardCollectionModel(Base):
    __tablename__ = "platform_card_collection"

    collection_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(256), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, default=None)
    created_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())
    updated_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())


class PlatformCardTemplateModel(Base):
    __tablename__ = "platform_card_template"

    template_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    collection_id: Mapped[str] = mapped_column(String(128), default="default", index=True)
    display_name: Mapped[str] = mapped_column(String(256), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    template_type: Mapped[str] = mapped_column(String(64), default="info_detail")
    renderer_key: Mapped[str] = mapped_column(String(128), default="")
    data_schema: Mapped[dict | None] = mapped_column(JSON, default=None)
    ui_schema: Mapped[dict | None] = mapped_column(JSON, default=None)
    action_schema: Mapped[dict | None] = mapped_column(JSON, default=None)
    sample_payload: Mapped[dict | None] = mapped_column(JSON, default=None)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, default=None)
    created_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())
    updated_at: Mapped[float] = mapped_column(Float, default=lambda: datetime.now().timestamp())
