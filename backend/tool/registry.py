import mcp_runtime  # noqa: F401

from plugin_runtime import ensure_plugin_runtime_loaded
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


def all_tools() -> dict[str, ToolEntry]:
    ensure_plugin_runtime_loaded()
    return _all_tools()


def get_tool(name: str) -> ToolEntry | None:
    ensure_plugin_runtime_loaded()
    return _get_tool(name)


def tool_defs() -> list[ToolDef]:
    ensure_plugin_runtime_loaded()
    return _tool_defs()


def global_tool_defs() -> list[ToolDef]:
    ensure_plugin_runtime_loaded()
    return _global_tool_defs()


def global_tool_names() -> list[str]:
    ensure_plugin_runtime_loaded()
    return _global_tool_names()


ensure_plugin_runtime_loaded()

__all__ = ["all_tools", "tool_defs", "get_tool", "parse_args", "ToolEntry", "ToolPolicy", "ToolResult", "ToolDef", "global_tool_defs", "global_tool_names"]
