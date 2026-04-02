import json
import inspect
import logging
from dataclasses import dataclass, field
from typing import Callable, Any
from pydantic import BaseModel, Field
from provider.base import ToolDef


logger = logging.getLogger(__name__)


class ToolResult(BaseModel):
    text: str = ""
    error: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


@dataclass
class ToolPolicy:
    risk_level: str = "low"
    confirm_policy: str = "inherit"
    allowed_scenarios: list[str] = field(default_factory=list)
    allowed_phases: list[str] = field(default_factory=list)
    required_entities: list[str] = field(default_factory=list)
    required_flags: list[str] = field(default_factory=list)
    idempotency_key_fields: list[str] = field(default_factory=list)
    conflict_keys: list[str] = field(default_factory=list)
    external_side_effect: bool = False
    fallback_to_knowledge: bool = False
    phase_guidance: str = ""

    @classmethod
    def from_value(cls, value: "ToolPolicy | dict | None", require_confirm: bool = False) -> "ToolPolicy":
        if isinstance(value, ToolPolicy):
            policy = ToolPolicy(**value.to_dict())
        elif isinstance(value, dict):
            policy = ToolPolicy(**value)
        else:
            policy = ToolPolicy()
        policy.risk_level = str(policy.risk_level or "low").strip().lower() or "low"
        policy.confirm_policy = str(policy.confirm_policy or "inherit").strip().lower() or "inherit"
        policy.allowed_scenarios = _normalize_text_list(policy.allowed_scenarios)
        policy.allowed_phases = _normalize_text_list(policy.allowed_phases)
        policy.required_entities = _normalize_text_list(policy.required_entities)
        policy.required_flags = _normalize_text_list(policy.required_flags)
        policy.idempotency_key_fields = _normalize_text_list(policy.idempotency_key_fields)
        policy.conflict_keys = _normalize_text_list(policy.conflict_keys)
        policy.phase_guidance = str(policy.phase_guidance or "").strip()
        if policy.confirm_policy == "inherit":
            policy.confirm_policy = "always" if require_confirm else "on_risky"
        return policy

    def requires_confirmation(self, require_confirm: bool = False) -> bool:
        if self.confirm_policy == "always":
            return True
        if self.confirm_policy == "never":
            return False
        if self.confirm_policy == "on_risky":
            return require_confirm or self.external_side_effect or self.risk_level in {"medium", "high", "critical"}
        return bool(require_confirm)

    def hint_text(self) -> str:
        hints: list[str] = []
        if self.allowed_scenarios:
            hints.append(f"场景: {', '.join(self.allowed_scenarios)}")
        if self.allowed_phases:
            hints.append(f"阶段: {', '.join(self.allowed_phases)}")
        if self.required_entities:
            hints.append(f"依赖实体: {', '.join(self.required_entities)}")
        if self.required_flags:
            hints.append(f"依赖标记: {', '.join(self.required_flags)}")
        if self.external_side_effect:
            hints.append("会产生外部业务动作")
        if self.fallback_to_knowledge:
            hints.append("条件不满足时优先改用 search_knowledge")
        if self.phase_guidance:
            hints.append(self.phase_guidance)
        return "；".join(hints)

    def to_dict(self) -> dict[str, Any]:
        return {
            "risk_level": self.risk_level,
            "confirm_policy": self.confirm_policy,
            "allowed_scenarios": list(self.allowed_scenarios),
            "allowed_phases": list(self.allowed_phases),
            "required_entities": list(self.required_entities),
            "required_flags": list(self.required_flags),
            "idempotency_key_fields": list(self.idempotency_key_fields),
            "conflict_keys": list(self.conflict_keys),
            "external_side_effect": bool(self.external_side_effect),
            "fallback_to_knowledge": bool(self.fallback_to_knowledge),
            "phase_guidance": self.phase_guidance,
        }


_registry: dict[str, "ToolEntry"] = {}
_dynamic_tool_provider: Callable[[], dict[str, "ToolEntry"]] | None = None


class ToolEntry:
    def __init__(self, name: str, description: str, parameters: dict, func: Callable,
                 require_confirm: bool = False, scope: str = "skill", policy: ToolPolicy | dict | None = None):
        self.name = name
        self.description = description
        self.parameters = parameters
        self.func = func
        self.require_confirm = require_confirm
        self.scope = scope  # "global" = 始终可用, "skill" = 仅当技能加载时可用
        self.policy = ToolPolicy.from_value(policy, require_confirm=require_confirm)

    def to_def(self) -> ToolDef:
        description = str(self.description or "").strip()
        hint = self.policy.hint_text()
        if hint:
            description = f"{description} [框架约束] {hint}" if description else f"[框架约束] {hint}"
        return ToolDef(
            name=self.name,
            description=description,
            parameters=self.parameters,
            require_confirm=self.policy.requires_confirmation(self.require_confirm),
        )

    def requires_confirmation(self) -> bool:
        return self.policy.requires_confirmation(self.require_confirm)

    def policy_snapshot(self) -> dict[str, Any]:
        return self.policy.to_dict()

    def accepted_arg_names(self) -> set[str] | None:
        schema = self.parameters or {}
        properties = (schema.get("properties") or {})
        if properties:
            if schema.get("additionalProperties") not in {None, False} or schema.get("patternProperties"):
                return None
            return {str(name) for name in properties.keys()}
        if schema.get("additionalProperties") not in {None, False} or schema.get("patternProperties"):
            return None
        sig = inspect.signature(self.func)
        if any(param.kind == inspect.Parameter.VAR_KEYWORD for param in sig.parameters.values()):
            return None
        return {
            name
            for name, param in sig.parameters.items()
            if param.kind in {inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY}
        }

    def accepts_argument(self, name: str) -> bool:
        accepted = self.accepted_arg_names()
        return True if accepted is None else name in accepted

    def sanitize_args(self, args: dict) -> dict:
        accepted = self.accepted_arg_names()
        if accepted is None:
            return dict(args or {})
        return {key: value for key, value in (args or {}).items() if key in accepted}

    async def execute(self, args: dict) -> ToolResult:
        try:
            if inspect.iscoroutinefunction(self.func):
                result = await self.func(**args)
            else:
                result = self.func(**args)
            if isinstance(result, ToolResult):
                return result
            return ToolResult(text=str(result))
        except Exception as e:
            return ToolResult(error=str(e))


def tool(
    name: str,
    description: str,
    parameters: dict,
    require_confirm: bool = False,
    scope: str = "skill",
    policy: ToolPolicy | dict | None = None,
):
    def decorator(func: Callable) -> Callable:
        entry = ToolEntry(name, description, parameters, func, require_confirm, scope=scope, policy=policy)
        _registry[name] = entry
        return func
    return decorator


def set_dynamic_tool_provider(provider: Callable[[], dict[str, ToolEntry]] | None) -> None:
    global _dynamic_tool_provider
    _dynamic_tool_provider = provider


def _runtime_tools() -> dict[str, ToolEntry]:
    if not _dynamic_tool_provider:
        return {}
    try:
        tools = _dynamic_tool_provider() or {}
        return dict(tools)
    except Exception:
        logger.exception("Failed to load runtime tools from provider")
        return {}


def _merged_tools() -> dict[str, ToolEntry]:
    tools = dict(_registry)
    tools.update(_runtime_tools())
    return tools


def all_tools() -> dict[str, ToolEntry]:
    return _merged_tools()


def get_tool(name: str) -> ToolEntry | None:
    tools = _merged_tools()
    return tools.get(name)


def tool_defs() -> list[ToolDef]:
    return [entry.to_def() for entry in _merged_tools().values()]


def global_tool_defs() -> list[ToolDef]:
    """返回所有 scope='global' 的工具定义（任何情况下都可调用）"""
    return [entry.to_def() for entry in _merged_tools().values() if entry.scope == "global"]


def global_tool_names() -> list[str]:
    """返回所有 scope='global' 的工具名称"""
    return [name for name, entry in _merged_tools().items() if entry.scope == "global"]


def parse_args(raw: str) -> dict:
    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {}


def _normalize_text_list(values: list[str] | tuple[str, ...] | set[str] | None) -> list[str]:
    result: list[str] = []
    seen = set()
    for value in values or []:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result
