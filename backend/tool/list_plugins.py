from plugin_runtime import discover_plugins, discover_skills, plugin_import_failures
from tool.base import tool, ToolResult


@tool(
    name="list_plugins",
    description="列出当前启用的插件、技能和插件运行时加载状态。",
    parameters={
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": False,
    },
    scope="global",
    policy={
        "risk_level": "low",
        "confirm_policy": "never",
    },
)
async def list_plugins() -> ToolResult:
    plugins = discover_plugins()
    skills = discover_skills()
    failures = plugin_import_failures()
    if not plugins:
        return ToolResult(text="当前没有启用任何插件。")

    skill_map: dict[str, list[str]] = {}
    for skill in skills:
        skill_map.setdefault(skill.plugin_id, []).append(skill.name)

    lines = ["当前启用插件：", ""]
    for plugin in plugins:
        tool_names = ", ".join(plugin.exports.tools) if plugin.exports.tools else "无"
        skill_names = ", ".join(skill_map.get(plugin.plugin_id, [])) or "无"
        lines.append(f"- {plugin.plugin_id}: {plugin.name}")
        lines.append(f"  - tools: {tool_names}")
        lines.append(f"  - skills: {skill_names}")
    if failures:
        lines.append("")
        lines.append("以下工具模块加载失败：")
        for tool_name, error in failures.items():
            lines.append(f"- {tool_name}: {error}")
    return ToolResult(text="\n".join(lines))
