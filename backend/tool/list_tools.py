from platform_registry import list_visible_tool_records
from tool.base import tool, ToolResult


@tool(
    name="list_tools",
    description="查看当前 Agent 在本轮上下文中可用的工具，以及它们的来源、卡片绑定和输入参数概览。",
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
async def list_tools() -> ToolResult:
    tools = list_visible_tool_records()
    if not tools:
        return ToolResult(text="当前没有可用工具。")

    lines = ["当前可用工具：", ""]
    for item in tools:
        lines.append(f"- {item.tool_name}: {item.summary or item.display_name or '无描述'}")
        lines.append(f"  - provider: {item.provider_type}")
        lines.append(f"  - scope: {item.scope}")
        lines.append(f"  - card: {item.card_type or ('已绑定' if item.supports_card else '无卡片')}")
        params = list((item.input_schema or {}).get('properties', {}).keys())
        lines.append(f"  - params: {', '.join(params) if params else '无'}")
    return ToolResult(text='\n'.join(lines))
