import re
from datetime import datetime
from typing import Any
from framework_profile import load_framework_profile, render_long_term_memory


def build_system(
    skill_summaries: str = "",
    phone: str = "",
    agent_state: dict | None = None,
    runtime_controls: dict | None = None,
    latest_user_text: str = "",
    system_core_prompt: str = "",
    persona_prompt: str = "",
    skill_guide_prompt: str = "",
    memory_prompt: str = "",
    agent_variables: list[dict[str, Any]] | None = None,
    agent_variable_values: dict[str, Any] | None = None,
) -> list[str]:
    profile = load_framework_profile()
    resolved_system_core = str(system_core_prompt or profile.prompts.system_core).strip()
    resolved_persona = _render_agent_variable_placeholders(str(persona_prompt or ""), agent_variable_values or {}).strip()
    resolved_skill_guide = str(skill_guide_prompt or profile.prompts.skill_guide).strip()
    parts = [
        _section("Layer 0: Service Rules", resolved_system_core),
        _section("Layer 0.5: Agent Persona", resolved_persona),
        _section("Layer 1: Skill and Tool Guide", resolved_skill_guide),
        _section("Layer 2: Time Context", f"当前时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}"),
    ]

    user_context = _build_user_context(phone)
    if user_context:
        parts.append(_section("Layer 3: User Context", user_context))

    variable_context = _build_agent_variable_context(agent_variables or [], agent_variable_values or {})
    if variable_context:
        parts.append(_section("Layer 3.5: Agent Bound Variables", variable_context))

    memory_text = render_long_term_memory(query=latest_user_text, prompt_override=memory_prompt)
    if memory_text:
        parts.append(_section("Layer 4: Long-Term Memory", memory_text))

    runtime_text = _build_runtime_controls(runtime_controls or {}, agent_state or {})
    if runtime_text:
        parts.append(_section("Layer 5: Runtime Controls", runtime_text))

    if skill_summaries:
        parts.append(_section("Layer 6: Skill Summaries", skill_summaries))
    return [part for part in parts if part]


def _build_user_context(phone: str) -> str:
    phone = str(phone or "").strip()
    if not phone:
        return ""
    return (
        f"- 当前会话绑定的用户标识: {phone}\n\n"
        f"如果后续工具需要用户标识，可优先直接使用该标识 {phone}，无需重复询问。"
    )


def _build_agent_variable_context(agent_variables: list[dict[str, Any]], agent_variable_values: dict[str, Any]) -> str:
    lines: list[str] = []
    for item in agent_variables:
        if not isinstance(item, dict):
            continue
        if not bool(item.get("inject_to_prompt")):
            continue
        key = str(item.get("key") or "").strip()
        if not key:
            continue
        value = agent_variable_values.get(key)
        if value in (None, "", [], {}):
            continue
        label = str(item.get("label") or key).strip() or key
        lines.append(f"- {label} ({key}): {value}")
    if not lines:
        return ""
    lines.append("- 上述变量由平台或上层业务显式注入；若工具参数已绑定这些变量，参数由系统自动填写，禁止自行编造或改写。")
    return "\n".join(lines)


def _render_agent_variable_placeholders(text: str, agent_variable_values: dict[str, Any]) -> str:
    source = str(text or "")
    values = dict(agent_variable_values or {})
    if not source or not values:
        return source

    def replace(match: re.Match[str]) -> str:
        key = str(match.group(1) or "").strip()
        if not key:
            return match.group(0)
        value = values.get(key)
        if value in (None, "", [], {}):
            return match.group(0)
        return str(value)

    return re.sub(r"\{\{\s*([a-zA-Z0-9_\-.]+)\s*\}\}", replace, source)


def _build_runtime_controls(runtime_controls: dict, agent_state: dict) -> str:
    lines: list[str] = []
    budget = runtime_controls.get("context_budget") or ((agent_state.get("runtime_state") or {}).get("context_budget") or {})
    pending = agent_state.get("pending_confirmation") or {}
    step = runtime_controls.get("step")
    max_steps = runtime_controls.get("max_steps")

    if isinstance(step, int) and isinstance(max_steps, int) and max_steps > 0:
        lines.append(f"- 当前执行步数: {step + 1}/{max_steps}")

    if budget:
        if budget.get("local_thin_applied"):
            lines.append("- 历史中的部分旧工具结果已局部瘦身；请优先信任结构化状态、最近工具结果和当前用户最新诉求。")
        if budget.get("over_budget_after_thin"):
            lines.append("- 当前上下文预算依然紧张；避免重复调用无关工具，优先沿 next_actions 推进。")
        if budget.get("should_compact"):
            lines.append("- 如果后续还要进行多轮工具调用，应优先让系统做上下文压缩后再继续。")

    if pending:
        lines.append(
            f"- 当前存在待确认动作: {pending.get('tool_name', '')}；在用户明确确认前，不要重复提交同类外部业务动作。"
        )

    if runtime_controls.get("tool_policy_warning"):
        lines.append(f"- 最近一次策略提醒: {runtime_controls.get('tool_policy_warning')}")

    if not lines:
        return ""
    return "\n".join(lines)


def _section(title: str, body: str) -> str:
    title = str(title or "").strip()
    body = str(body or "").strip()
    if not title or not body:
        return ""
    return f"## {title}\n\n{body}"
