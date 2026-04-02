import json
from provider.base import Provider
from agent.state import format_agent_state
from config import settings

COMPACTION_PROMPT = """你将为一个电信客服 agent 生成对话压缩摘要，用于替代冗长历史。
请只输出“continuity summary”部分，重点包含：
1. 用户当前核心诉求、偏好和限制条件
2. 已完成的关键步骤和重要结论
3. 当前处于哪个业务阶段
4. 接下来最合理的下一步
5. 不要重复抄写结构化状态和最近工具结果，因为这些会在外层单独保留

要求：中文、简洁、可供后续轮次直接延续。"""


async def compact(provider: Provider, messages: list[dict], agent_state: dict | None = None) -> str:
    """调用模型生成分层压缩摘要：结构化状态 + 最近关键工具结果 + continuity summary。"""
    state_text = format_agent_state(agent_state or {}, include_history=True) or "(无结构化状态)"
    recent_tools = _recent_tool_outcomes(messages, limit=settings.summary_recent_tool_limit)
    conversation_text = _conversation_excerpt(messages, limit=settings.summary_excerpt_chars)
    max_output_tokens = settings.summary_max_output_tokens if settings.summary_max_output_tokens > 0 else 2000

    resp = await provider.client.chat.completions.create(
        model=provider.model,
        messages=[
            {"role": "system", "content": COMPACTION_PROMPT},
            {
                "role": "user",
                "content": (
                    "# 当前结构化状态\n"
                    f"{state_text}\n\n"
                    "# 最近关键工具结果\n"
                    f"{recent_tools}\n\n"
                    "# 对话摘录\n"
                    f"{conversation_text}"
                ),
            },
        ],
        temperature=0.3,
        max_tokens=max_output_tokens,
    )
    continuity = (resp.choices[0].message.content or "").strip()
    sections = [
        "[对话已压缩，以下为分层连续性摘要]",
        "## Layer 1: Structured State",
        state_text,
        "## Layer 2: Recent Tool Outcomes",
        recent_tools,
        "## Layer 3: Continuity Summary",
        continuity or "(模型未返回摘要)",
    ]
    return "\n\n".join(sections)


def _conversation_excerpt(messages: list[dict], limit: int = 60000) -> str:
    history_text = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if isinstance(content, list):
            content = json.dumps(content, ensure_ascii=False, default=str)
        content = str(content or "")
        if role == "tool":
            content = content[:500] + "..." if len(content) > 500 else content
        if content:
            history_text.append(f"[{role}] {content}")
    joined = "\n\n".join(history_text)
    if limit > 0 and len(joined) > limit:
        half = limit // 2
        joined = joined[:half] + "\n\n...[中间省略]...\n\n" + joined[-half:]
    return joined


def _recent_tool_outcomes(messages: list[dict], limit: int = 6) -> str:
    rows = []
    for msg in messages:
        if msg.get("role") != "tool":
            continue
        text = str(msg.get("content", "") or "").strip()
        if not text:
            continue
        if len(text) > 320:
            text = text[:320] + "..."
        rows.append(f"- {text}")
    if not rows:
        return "- (近期没有工具结果)"
    if limit <= 0:
        return "\n".join(rows)
    return "\n".join(rows[-limit:])
