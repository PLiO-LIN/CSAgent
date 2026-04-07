from platform_registry import list_skill_records
from tool.base import tool, ToolResult


@tool(
    name="list_skills",
    description="查看当前 Agent 可加载的技能摘要，以及每个技能绑定的专属工具。",
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
    metadata={
        "internal": True,
        "admin_hidden": True,
        "managed_by": "platform_runtime",
    },
)
async def list_skills() -> ToolResult:
    skills = list_skill_records()
    if not skills:
        return ToolResult(text="当前没有可用技能。")

    lines = ["当前可用技能：", ""]
    for item in skills:
        lines.append(f"- {item.skill_name}: {item.summary or item.display_name or '无描述'}")
        lines.append(f"  - tools: {', '.join(item.tool_names) if item.tool_names else '无'}")
        lines.append(f"  - global_tools: {', '.join(item.global_tool_names) if item.global_tool_names else '无'}")
    return ToolResult(text='\n'.join(lines))
