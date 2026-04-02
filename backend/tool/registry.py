import mcp_runtime  # noqa: F401

from tool.base import (
    ToolEntry,
    ToolPolicy,
    ToolResult,
    all_tools as _all_tools,
    get_tool as _get_tool,
    global_tool_defs as _global_tool_defs,
    global_tool_names as _global_tool_names,
    parse_args,
    tool_defs as _tool_defs,
)
from provider.base import ToolDef


_local_tools_loaded = False


def ensure_local_tools_loaded() -> None:
    global _local_tools_loaded
    if _local_tools_loaded:
        return
    from tool import list_tools as _list_tools  # noqa: F401
    from tool import load_skills as _load_skills  # noqa: F401

    _local_tools_loaded = True


def all_tools() -> dict[str, ToolEntry]:
    ensure_local_tools_loaded()
    return _all_tools()


def get_tool(name: str) -> ToolEntry | None:
    ensure_local_tools_loaded()
    return _get_tool(name)


def tool_defs() -> list[ToolDef]:
    ensure_local_tools_loaded()
    return _tool_defs()


def global_tool_defs() -> list[ToolDef]:
    ensure_local_tools_loaded()
    return _global_tool_defs()


def global_tool_names() -> list[str]:
    ensure_local_tools_loaded()
    return _global_tool_names()


ensure_local_tools_loaded()

__all__ = ["all_tools", "tool_defs", "get_tool", "parse_args", "ToolEntry", "ToolPolicy", "ToolResult", "ToolDef", "global_tool_defs", "global_tool_names"]
