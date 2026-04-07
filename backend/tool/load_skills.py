"""全局工具：列出 / 加载技能。

模型可以调用 load_skills 来：
1. 不传参数 → 返回所有可用技能的摘要列表（name + description）
2. 传 skill_name → 返回该技能的完整提示词 + 工具列表，作为 tool_result 进入后续对话上下文

技能是按场景组织的能力包，例如查询、推荐、下单；知识检索属于全局工具，不应作为 skill 加载。
"""
from tool.base import tool, ToolResult


@tool(
    name="load_skills",
    description=(
        "列出或加载场景技能。不传参数返回所有可用技能摘要；"
        "传入 skill_name 加载该场景技能的完整说明，并通过工具结果提供给当前对话。"
        "mode 默认为 switch，表示切换到新的场景技能并停用旧场景技能；"
        "仅当确实需要跨场景并行处理时，才使用 append 追加保留已有技能。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "skill_name": {
                "type": "string",
                "description": "要加载的技能名称。留空则返回所有技能摘要列表。",
            },
            "mode": {
                "type": "string",
                "description": "加载模式：switch=切换到该技能；append=在保留已有技能的同时追加该技能。默认 switch。",
                "enum": ["switch", "append"],
            },
        },
        "required": [],
    },
    scope="global",
    policy={
        "risk_level": "low",
        "confirm_policy": "never",
        "phase_guidance": "当当前工具集不足以完成客服场景时，再加载对应技能",
    },
    metadata={
        "internal": True,
        "admin_hidden": True,
        "managed_by": "platform_runtime",
    },
)
async def load_skills(skill_name: str = "", mode: str = "switch") -> ToolResult:
    from skill.base import list_skills, get_skill

    mode = str(mode or "switch").strip().lower() or "switch"
    if mode not in {"switch", "append"}:
        mode = "switch"

    if not skill_name:
        skills = list_skills()
        if not skills:
            return ToolResult(text="当前没有可用的技能。")
        lines = ["可用场景技能列表：", ""]
        for s in skills:
            lines.append(s.summary_text(active=False))
        lines.append("")
        lines.append("如需查看某个技能的完整正文，请调用 load_skills(skill_name=\"技能名\", mode=\"switch\")。")
        return ToolResult(text="\n".join(lines))

    skill = get_skill(skill_name)
    if not skill:
        available = [s.name for s in list_skills()]
        return ToolResult(
            error=f"未找到技能 '{skill_name}'。可用技能: {', '.join(available)}"
        )

    lines = [
        f"已加载技能: {skill.name}",
        f"描述: {skill.description}",
        f"专属工具: {', '.join(skill.tools) if skill.tools else '无'}",
        f"加载模式: {mode}",
        "",
        "系统提示中仅保留技能摘要；完整技能正文通过本次工具结果提供。",
        "专属工具已启用。",
        "",
        f"<skill name=\"{skill.name}\">",
        skill.prompt or "(该技能未提供正文)",
        "</skill>",
    ]
    return ToolResult(
        text="\n".join(lines),
        metadata={"_skill_loaded": skill.name, "_skill_mode": mode},
    )
