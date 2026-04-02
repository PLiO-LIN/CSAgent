from pathlib import Path
from typing import Any
import yaml
from pydantic import BaseModel, Field, field_validator, model_validator


PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
CONFIG_FILE = BACKEND_DIR / "config.yaml"


def _coerce_text_list(value: Any) -> list[str]:
    if value in {None, ""}:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, (list, tuple, set)):
        return [str(item or "").strip() for item in value if str(item or "").strip()]
    return [str(value).strip()] if str(value).strip() else []


def _coerce_text_dict(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    result: dict[str, str] = {}
    for key, item in value.items():
        text_key = str(key or "").strip()
        if not text_key:
            continue
        result[text_key] = str(item or "")
    return result


class McpServerSettings(BaseModel):
    enabled: bool = True
    transport: str = "stdio"
    command: str = ""
    args: list[str] = Field(default_factory=list)
    env: dict[str, str] = Field(default_factory=dict)
    cwd: str = ""
    url: str = ""
    headers: dict[str, str] = Field(default_factory=dict)
    timeout_seconds: float = 30.0
    sse_read_timeout_seconds: float = 300.0
    tool_timeout_seconds: float = 60.0
    scope: str = "global"
    tool_name_prefix: str = ""
    include_tools: list[str] = Field(default_factory=list)
    exclude_tools: list[str] = Field(default_factory=list)
    risk_level: str = "auto"
    confirm_policy: str = "auto"

    @model_validator(mode="before")
    @classmethod
    def normalize_input(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        data = dict(value)
        if "type" in data and "transport" not in data:
            data["transport"] = data.get("type")
        return data

    @field_validator("transport", mode="before")
    @classmethod
    def normalize_transport(cls, value: Any) -> str:
        text = str(value or "stdio").strip().lower() or "stdio"
        aliases = {
            "streamable-http": "http",
            "streamable_http": "http",
        }
        return aliases.get(text, text)

    @field_validator("args", "include_tools", "exclude_tools", mode="before")
    @classmethod
    def normalize_text_list(cls, value: Any) -> list[str]:
        return _coerce_text_list(value)

    @field_validator("env", "headers", mode="before")
    @classmethod
    def normalize_text_dict(cls, value: Any) -> dict[str, str]:
        return _coerce_text_dict(value)

    @field_validator("command", "cwd", "url", "tool_name_prefix", mode="before")
    @classmethod
    def normalize_text_field(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator("cwd", mode="after")
    @classmethod
    def normalize_cwd(cls, value: str) -> str:
        text = str(value or "").strip()
        if not text:
            return ""
        path = Path(text)
        return str(path if path.is_absolute() else (PROJECT_ROOT / path).resolve())

    @field_validator("scope", mode="before")
    @classmethod
    def normalize_scope(cls, value: Any) -> str:
        text = str(value or "global").strip().lower() or "global"
        return text if text in {"global", "skill"} else "global"

    @field_validator("risk_level", mode="before")
    @classmethod
    def normalize_risk_level(cls, value: Any) -> str:
        text = str(value or "auto").strip().lower() or "auto"
        return text if text in {"auto", "low", "medium", "high", "critical"} else "auto"

    @field_validator("confirm_policy", mode="before")
    @classmethod
    def normalize_confirm_policy(cls, value: Any) -> str:
        text = str(value or "auto").strip().lower() or "auto"
        return text if text in {"auto", "inherit", "never", "on_risky", "always"} else "auto"

    model_config = {"extra": "ignore"}


class Settings(BaseModel):
    # SiliconFlow
    api_key: str = ""
    base_url: str = "https://api.siliconflow.cn/v1"
    chat_model: str = "Qwen/Qwen3-32B"
    embed_model: str = "BAAI/bge-m3"

    # 数据库
    database_url: str = "sqlite+aiosqlite:///./csagent.db"

    # Agent
    max_steps: int = 30
    max_tool_output: int = 16000

    # Context Budget
    context_budget_tokens: int = 28000
    context_output_reserve_tokens: int = 4000
    context_local_thin_trigger_tokens: int = 18000
    context_local_tool_chars: int = 1200
    context_local_assistant_chars: int = 1000
    context_local_keep_messages: int = 14
    context_local_recent_tool_messages: int = 4

    # Summary
    summary_trigger_turns: int = 0
    summary_trigger_context_tokens: int = 80000
    summary_keep_recent_turns: int = 2
    summary_excerpt_chars: int = 60000
    summary_recent_tool_limit: int = 6
    summary_max_output_tokens: int = 2000

    # MCP
    mcp_enabled: bool = False
    mcp_tool_timeout_seconds: float = 60.0
    mcp_servers: dict[str, McpServerSettings] = Field(default_factory=dict)

    # 服务
    host: str = "0.0.0.0"
    port: int = 8200

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        value = str(value or "").strip()
        prefix = "sqlite+aiosqlite:///"
        if value.startswith(prefix):
            raw_path = value[len(prefix):]
            if Path(raw_path).is_absolute():
                return value
            return f"{prefix}{(PROJECT_ROOT / raw_path).resolve().as_posix()}"
        return value

    model_config = {"extra": "ignore"}


def _read_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise ValueError(f"Config YAML must be a mapping object: {path}")
    data = dict(raw)
    data.update(_flatten_yaml_sections(raw))
    return data


def _nest_yaml_sections(data: dict) -> dict:
    return {
        "llm": {
            "api_key": data.get("api_key", ""),
            "base_url": data.get("base_url", "https://api.siliconflow.cn/v1"),
            "chat_model": data.get("chat_model", "Qwen/Qwen3-32B"),
            "embed_model": data.get("embed_model", "BAAI/bge-m3"),
        },
        "database": {
            "url": _display_database_url(data.get("database_url", "sqlite+aiosqlite:///./csagent.db")),
        },
        "agent": {
            "max_steps": data.get("max_steps", 30),
            "max_tool_output": data.get("max_tool_output", 16000),
        },
        "context": {
            "budget_tokens": data.get("context_budget_tokens", 28000),
            "output_reserve_tokens": data.get("context_output_reserve_tokens", 4000),
            "local_thin_trigger_tokens": data.get("context_local_thin_trigger_tokens", 18000),
            "local_tool_chars": data.get("context_local_tool_chars", 1200),
            "local_assistant_chars": data.get("context_local_assistant_chars", 1000),
            "local_keep_messages": data.get("context_local_keep_messages", 14),
            "local_recent_tool_messages": data.get("context_local_recent_tool_messages", 4),
        },
        "summary": {
            "trigger_turns": data.get("summary_trigger_turns", 0),
            "trigger_context_tokens": data.get("summary_trigger_context_tokens", 80000),
            "keep_recent_turns": data.get("summary_keep_recent_turns", 2),
            "excerpt_chars": data.get("summary_excerpt_chars", 60000),
            "recent_tool_limit": data.get("summary_recent_tool_limit", 6),
            "max_output_tokens": data.get("summary_max_output_tokens", 2000),
        },
        "mcp": {
            "enabled": data.get("mcp_enabled", False),
            "tool_timeout_seconds": data.get("mcp_tool_timeout_seconds", 60.0),
            "servers": data.get("mcp_servers", {}),
        },
        "server": {
            "host": data.get("host", "0.0.0.0"),
            "port": data.get("port", 8200),
        },
    }


def _flatten_yaml_sections(data: dict) -> dict:
    flat: dict = {}
    llm = data.get("llm")
    if isinstance(llm, dict):
        if "api_key" in llm:
            flat["api_key"] = llm.get("api_key")
        if "base_url" in llm:
            flat["base_url"] = llm.get("base_url")
        if "chat_model" in llm:
            flat["chat_model"] = llm.get("chat_model")
        if "embed_model" in llm:
            flat["embed_model"] = llm.get("embed_model")

    database = data.get("database")
    if isinstance(database, dict) and "url" in database:
        flat["database_url"] = database.get("url")

    agent = data.get("agent")
    if isinstance(agent, dict):
        if "max_steps" in agent:
            flat["max_steps"] = agent.get("max_steps")
        if "max_tool_output" in agent:
            flat["max_tool_output"] = agent.get("max_tool_output")

    context = data.get("context")
    if isinstance(context, dict):
        if "budget_tokens" in context:
            flat["context_budget_tokens"] = context.get("budget_tokens")
        if "output_reserve_tokens" in context:
            flat["context_output_reserve_tokens"] = context.get("output_reserve_tokens")
        if "local_thin_trigger_tokens" in context:
            flat["context_local_thin_trigger_tokens"] = context.get("local_thin_trigger_tokens")
        if "local_tool_chars" in context:
            flat["context_local_tool_chars"] = context.get("local_tool_chars")
        if "local_assistant_chars" in context:
            flat["context_local_assistant_chars"] = context.get("local_assistant_chars")
        if "local_keep_messages" in context:
            flat["context_local_keep_messages"] = context.get("local_keep_messages")
        if "local_recent_tool_messages" in context:
            flat["context_local_recent_tool_messages"] = context.get("local_recent_tool_messages")

    summary = data.get("summary")
    if isinstance(summary, dict):
        if "trigger_turns" in summary:
            flat["summary_trigger_turns"] = summary.get("trigger_turns")
        if "trigger_context_tokens" in summary:
            flat["summary_trigger_context_tokens"] = summary.get("trigger_context_tokens")
        if "keep_recent_turns" in summary:
            flat["summary_keep_recent_turns"] = summary.get("keep_recent_turns")
        if "excerpt_chars" in summary:
            flat["summary_excerpt_chars"] = summary.get("excerpt_chars")
        if "recent_tool_limit" in summary:
            flat["summary_recent_tool_limit"] = summary.get("recent_tool_limit")
        if "max_output_tokens" in summary:
            flat["summary_max_output_tokens"] = summary.get("max_output_tokens")
    elif isinstance(agent, dict) and "compaction_threshold" in agent:
        flat["summary_trigger_context_tokens"] = agent.get("compaction_threshold")

    mcp = data.get("mcp")
    if isinstance(mcp, dict):
        if "enabled" in mcp:
            flat["mcp_enabled"] = mcp.get("enabled")
        if "tool_timeout_seconds" in mcp:
            flat["mcp_tool_timeout_seconds"] = mcp.get("tool_timeout_seconds")
        if "servers" in mcp and isinstance(mcp.get("servers"), dict):
            flat["mcp_servers"] = mcp.get("servers")

    server = data.get("server")
    if isinstance(server, dict):
        if "host" in server:
            flat["host"] = server.get("host")
        if "port" in server:
            flat["port"] = server.get("port")
    return flat


def _display_database_url(value: str) -> str:
    value = str(value or "").strip()
    default_abs = f"sqlite+aiosqlite:///{(PROJECT_ROOT / 'csagent.db').resolve().as_posix()}"
    if value == default_abs:
        return "sqlite+aiosqlite:///./csagent.db"
    return value


def _yaml_scalar(value: object) -> str:
    rendered = yaml.safe_dump({"value": value}, allow_unicode=True, sort_keys=False).strip()
    return rendered.split(":", 1)[1].strip()


def _yaml_block(value: object, indent: int) -> list[str]:
    rendered = yaml.safe_dump(value, allow_unicode=True, sort_keys=False).rstrip()
    prefix = " " * indent
    return [f"{prefix}{line}" if line else "" for line in rendered.splitlines()]


def _render_yaml(data: dict) -> str:
    lines = [
        "# backend/config.yaml",
        "# 唯一配置入口。修改后请重启后端服务。",
        "",
        "llm:",
        "  # 大模型 API Key。不要提交到版本库。",
        f"  api_key: {_yaml_scalar(data.get('api_key', ''))}",
        "  # OpenAI 兼容接口地址。SiliconFlow 默认使用该地址。",
        f"  base_url: {_yaml_scalar(data.get('base_url', 'https://api.siliconflow.cn/v1'))}",
        "  # 主对话模型名。聊天回复、工具调用和总结都会使用它。",
        f"  chat_model: {_yaml_scalar(data.get('chat_model', 'Qwen/Qwen3-32B'))}",
        "  # 向量模型名。知识检索建索引和查询时使用。",
        f"  embed_model: {_yaml_scalar(data.get('embed_model', 'BAAI/bge-m3'))}",
        "",
        "database:",
        "  # 数据库连接串。相对 SQLite 路径会归一化到项目根目录。",
        f"  url: {_yaml_scalar(_display_database_url(data.get('database_url', 'sqlite+aiosqlite:///./csagent.db')))}",
        "",
        "agent:",
        "  # 单轮 Agent 最多可执行多少个 step；达到后会停止继续调用工具。",
        f"  max_steps: {_yaml_scalar(data.get('max_steps', 30))}",
        "  # 单个工具结果最多保留多少字符进入上下文，超过后会自动截断。",
        f"  max_tool_output: {_yaml_scalar(data.get('max_tool_output', 16000))}",
        "",
        "context:",
        "  # 进入模型前的总上下文预算；超过后会先做局部瘦身，仍不足再触发总结。",
        f"  budget_tokens: {_yaml_scalar(data.get('context_budget_tokens', 28000))}",
        "  # 给模型输出预留的 token 空间，避免上下文占满窗口。",
        f"  output_reserve_tokens: {_yaml_scalar(data.get('context_output_reserve_tokens', 4000))}",
        "  # 粗估上下文超过该值时，优先对旧工具结果做局部瘦身。",
        f"  local_thin_trigger_tokens: {_yaml_scalar(data.get('context_local_thin_trigger_tokens', 18000))}",
        "  # 被局部瘦身的旧工具结果最多保留多少字符。",
        f"  local_tool_chars: {_yaml_scalar(data.get('context_local_tool_chars', 1200))}",
        "  # 被局部瘦身的旧 assistant 内容最多保留多少字符。",
        f"  local_assistant_chars: {_yaml_scalar(data.get('context_local_assistant_chars', 1000))}",
        "  # 无论是否瘦身，都完整保留最近多少条消息。",
        f"  local_keep_messages: {_yaml_scalar(data.get('context_local_keep_messages', 14))}",
        "  # 无论是否瘦身，都完整保留最近多少条 tool 消息。",
        f"  local_recent_tool_messages: {_yaml_scalar(data.get('context_local_recent_tool_messages', 4))}",
        "",
        "summary:",
        "  # 用户对话超过多少轮后触发总结；设为 0 表示不按轮数触发。",
        f"  trigger_turns: {_yaml_scalar(data.get('summary_trigger_turns', 0))}",
        "  # 上下文粗估 token 超过多少后触发总结；设为 0 表示不按长度触发。",
        f"  trigger_context_tokens: {_yaml_scalar(data.get('summary_trigger_context_tokens', 80000))}",
        "  # 总结完成后，除摘要外额外保留最近多少轮原始对话。",
        f"  keep_recent_turns: {_yaml_scalar(data.get('summary_keep_recent_turns', 2))}",
        "  # 生成总结时最多截取多少字符作为对话摘录发给模型。",
        f"  excerpt_chars: {_yaml_scalar(data.get('summary_excerpt_chars', 60000))}",
        "  # 总结里最多保留多少条最近工具结果摘要。",
        f"  recent_tool_limit: {_yaml_scalar(data.get('summary_recent_tool_limit', 6))}",
        "  # 总结调用最多允许模型输出多少 token。",
        f"  max_output_tokens: {_yaml_scalar(data.get('summary_max_output_tokens', 2000))}",
        "",
        "mcp:",
        f"  enabled: {_yaml_scalar(data.get('mcp_enabled', False))}",
        f"  tool_timeout_seconds: {_yaml_scalar(data.get('mcp_tool_timeout_seconds', 60.0))}",
        "  servers:",
        *_yaml_block(data.get('mcp_servers', {}) or {}, 4),
        "",
        "server:",
        "  # FastAPI 主服务监听地址。",
        f"  host: {_yaml_scalar(data.get('host', '0.0.0.0'))}",
        "  # FastAPI 主服务端口。",
        f"  port: {_yaml_scalar(data.get('port', 8200))}",
    ]
    return "\n".join(lines) + "\n"


def _write_yaml(path: Path, data: dict) -> None:
    path.write_text(_render_yaml(data), encoding="utf-8")


def _load_settings_data() -> dict:
    defaults = Settings().model_dump()
    if CONFIG_FILE.exists():
        data = dict(defaults)
        data.update(_read_yaml(CONFIG_FILE))
        return data
    _write_yaml(CONFIG_FILE, defaults)
    return defaults


settings = Settings.model_validate(_load_settings_data())
