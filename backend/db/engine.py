import logging
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from config import settings


logger = logging.getLogger(__name__)


SCHEMA_PATCHES: dict[str, dict[str, str]] = {
    "llm_request": {
        "provider": "VARCHAR(64) NOT NULL DEFAULT ''",
        "phone": "VARCHAR(32) NOT NULL DEFAULT ''",
        "active_skill": "VARCHAR(128) NOT NULL DEFAULT ''",
        "active_skills_json": "TEXT NOT NULL DEFAULT '[]'",
        "workflow_scenario": "VARCHAR(64) NOT NULL DEFAULT ''",
        "workflow_phase": "VARCHAR(64) NOT NULL DEFAULT ''",
        "workflow_goal": "TEXT NOT NULL DEFAULT ''",
        "status": "VARCHAR(32) NOT NULL DEFAULT 'started'",
        "request_message_count": "INTEGER NOT NULL DEFAULT 0",
        "request_user_turns": "INTEGER NOT NULL DEFAULT 0",
        "request_estimated_tokens": "INTEGER NOT NULL DEFAULT 0",
        "request_tool_count": "INTEGER NOT NULL DEFAULT 0",
        "request_context_budget_json": "TEXT NOT NULL DEFAULT '{}'",
        "request_meta_json": "TEXT NOT NULL DEFAULT '{}'",
        "response_finish_reason": "VARCHAR(64) NOT NULL DEFAULT ''",
        "response_text_chars": "INTEGER NOT NULL DEFAULT 0",
        "response_thinking_chars": "INTEGER NOT NULL DEFAULT 0",
        "response_tool_call_count": "INTEGER NOT NULL DEFAULT 0",
        "response_tool_names_json": "TEXT NOT NULL DEFAULT '[]'",
        "response_meta_json": "TEXT NOT NULL DEFAULT '{}'",
        "error_text": "TEXT NOT NULL DEFAULT ''",
        "latency_ms": "INTEGER NOT NULL DEFAULT 0",
        "completed_at": "REAL NOT NULL DEFAULT 0",
    },
    "agent_event_log": {
        "llm_request_id": "VARCHAR(32) NOT NULL DEFAULT ''",
        "step": "INTEGER NOT NULL DEFAULT 0",
        "provider": "VARCHAR(64) NOT NULL DEFAULT ''",
        "phone": "VARCHAR(32) NOT NULL DEFAULT ''",
        "category": "VARCHAR(32) NOT NULL DEFAULT ''",
        "event_type": "VARCHAR(64) NOT NULL DEFAULT ''",
        "status": "VARCHAR(32) NOT NULL DEFAULT ''",
        "active_skill": "VARCHAR(128) NOT NULL DEFAULT ''",
        "active_skills_json": "TEXT NOT NULL DEFAULT '[]'",
        "workflow_scenario": "VARCHAR(64) NOT NULL DEFAULT ''",
        "workflow_phase": "VARCHAR(64) NOT NULL DEFAULT ''",
        "tool_name": "VARCHAR(128) NOT NULL DEFAULT ''",
        "tool_call_id": "VARCHAR(64) NOT NULL DEFAULT ''",
        "summary": "TEXT NOT NULL DEFAULT ''",
        "payload_json": "TEXT NOT NULL DEFAULT '{}'",
        "latency_ms": "INTEGER NOT NULL DEFAULT 0",
        "created_at": "REAL NOT NULL DEFAULT 0",
    },
    "platform_card_template": {
        "collection_id": "VARCHAR(128) NOT NULL DEFAULT 'default'",
    },
}


engine = create_async_engine(settings.database_url, echo=False)
Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    async with engine.begin() as conn:
        from db.models import SessionModel, MessageModel, PartModel, LLMRequestModel, AgentEventLogModel, PlatformToolModel, PlatformSkillModel, PlatformAgentModel, PlatformAgentApiKeyModel, PlatformCardCollectionModel, PlatformCardTemplateModel  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_schema_patches)


async def get_db():
    async with Session() as session:
        yield session


def _ensure_schema_patches(sync_conn) -> None:
    inspector = inspect(sync_conn)
    for table_name, column_defs in SCHEMA_PATCHES.items():
        if not inspector.has_table(table_name):
            continue
        existing = {col.get("name") for col in inspector.get_columns(table_name)}
        for column_name, ddl in column_defs.items():
            if column_name in existing:
                continue
            logger.info("Patching database schema: add column %s.%s", table_name, column_name)
            sync_conn.exec_driver_sql(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}")
