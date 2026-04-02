from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass


@dataclass(frozen=True)
class RuntimeScope:
    agent_id: str = ""
    global_tool_names: tuple[str, ...] = ()
    skill_names: tuple[str, ...] = ()
    active_skill_names: tuple[str, ...] = ()


_current_scope: ContextVar[RuntimeScope] = ContextVar("runtime_scope", default=RuntimeScope())


def set_runtime_scope(
    *,
    agent_id: str = "",
    global_tool_names: list[str] | tuple[str, ...] | None = None,
    skill_names: list[str] | tuple[str, ...] | None = None,
    active_skill_names: list[str] | tuple[str, ...] | None = None,
) -> Token:
    scope = RuntimeScope(
        agent_id=str(agent_id or "").strip(),
        global_tool_names=tuple(str(item or "").strip() for item in (global_tool_names or []) if str(item or "").strip()),
        skill_names=tuple(str(item or "").strip() for item in (skill_names or []) if str(item or "").strip()),
        active_skill_names=tuple(str(item or "").strip() for item in (active_skill_names or []) if str(item or "").strip()),
    )
    return _current_scope.set(scope)


def reset_runtime_scope(token: Token) -> None:
    _current_scope.reset(token)


def current_runtime_scope() -> RuntimeScope:
    return _current_scope.get()
