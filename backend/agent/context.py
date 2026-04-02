import json
from db.models import MessageModel
from config import settings

COMPACTION_HEADER = "[对话已压缩，以下为分层连续性摘要]"


def rebuild(messages: list[MessageModel]) -> list[dict]:
    """从数据库消息重建模型可用的消息列表。
    按压缩边界截断：如果存在 compaction part，则保留摘要本身以及配置要求保留的最近轮次。
    """
    cutoff = -1
    keep_from_index = -1
    for i, msg in enumerate(messages):
        for part in msg.parts:
            if part.type == "compaction":
                cutoff = i
                keep_from_index = _resolve_keep_from_index(messages, i, part.metadata_ or {})

    if cutoff < 0:
        return to_model_messages(messages)

    visible = [messages[cutoff]]
    if 0 <= keep_from_index < cutoff:
        visible.extend(messages[keep_from_index:cutoff])
    visible.extend(messages[cutoff + 1:])
    return to_model_messages(visible)


def find_keep_from_message_id(messages: list[MessageModel], keep_recent_turns: int = 0) -> str:
    if keep_recent_turns <= 0:
        return ""

    turns = 0
    for msg in reversed(messages):
        if not _is_user_turn_message(msg):
            continue
        turns += 1
        if turns >= keep_recent_turns:
            return msg.id

    for msg in messages:
        if _is_user_turn_message(msg):
            return msg.id
    return ""


def _resolve_keep_from_index(messages: list[MessageModel], cutoff: int, metadata: dict | None = None) -> int:
    keep_from_message_id = str((metadata or {}).get("keep_from_message_id", "") or "").strip()
    if not keep_from_message_id:
        return -1
    for i, msg in enumerate(messages[:cutoff]):
        if msg.id == keep_from_message_id:
            return i
    return -1


def _is_user_turn_message(message: MessageModel) -> bool:
    if message.role != "user":
        return False
    return any(part.type != "compaction" for part in message.parts)


def to_model_messages(messages: list[MessageModel]) -> list[dict]:
    """将数据库消息转为 OpenAI 格式的消息列表。"""
    result = []
    tool_result_map: dict[str, str] = {}
    for m in messages:
        for p in m.parts:
            if p.type == "tool_result" and p.metadata_ and p.metadata_.get("tool_call_id"):
                call_id = p.metadata_.get("tool_call_id")
                if call_id and call_id not in tool_result_map:
                    tool_result_map[call_id] = _truncate(p.content)

    for msg in messages:
        if not msg.parts:
            continue
        if msg.role == "user":
            texts = []
            for part in sorted(msg.parts, key=lambda p: p.index):
                if part.type == "text":
                    texts.append(part.content)
                elif part.type == "compaction":
                    texts.append(part.content)
                elif part.type == "card":
                    # 用户通过卡片按钮触发的操作
                    texts.append(f"[用户操作] {part.content}")
            if texts:
                result.append({"role": "user", "content": "\n".join(texts)})

        elif msg.role == "assistant":
            text_parts = []
            tool_calls = []
            for part in sorted(msg.parts, key=lambda p: p.index):
                if part.type == "text":
                    text_parts.append(part.content)
                elif part.type == "tool_call":
                    tc = json.loads(part.content) if isinstance(part.content, str) else part.content
                    tool_calls.append(tc)

            if tool_calls:
                oai_calls = [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {"name": tc["name"], "arguments": tc.get("arguments", "")},
                    }
                    for tc in tool_calls
                ]
                entry = {"role": "assistant", "tool_calls": oai_calls}
                if text_parts:
                    entry["content"] = "\n".join(text_parts)
                result.append(entry)

                # 对应的 tool result 紧跟其后
                for tc in tool_calls:
                    tool_result = _find_tool_result(msg, tc["id"], tool_result_map)
                    result.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": tool_result,
                    })
            elif text_parts:
                result.append({"role": "assistant", "content": "\n".join(text_parts)})

    return result


def _find_tool_result(msg: MessageModel, call_id: str, fallback: dict[str, str] | None = None) -> str:
    """在同一消息的 parts 中找到对应 tool_call_id 的结果。"""
    for part in msg.parts:
        if part.type == "tool_result" and part.metadata_ and part.metadata_.get("tool_call_id") == call_id:
            return _truncate(part.content)
    if fallback and call_id in fallback:
        return fallback[call_id]
    return ""


def _truncate(text: str, limit: int = 0) -> str:
    if not limit:
        limit = settings.max_tool_output
    if len(text) <= limit:
        return text
    half = limit // 2
    return text[:half] + f"\n\n... [已截断，原文 {len(text)} 字符] ...\n\n" + text[-half:]


def estimate_tokens(messages: list[dict]) -> int:
    """粗略估算 token 数（按字符数 / 2 估算中文场景）。"""
    total = 0
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, str):
            total += len(content)
        if "tool_calls" in msg:
            for tc in msg["tool_calls"]:
                total += len(tc["function"].get("arguments", ""))
    return total // 2


def apply_budget_governance(messages: list[dict]) -> tuple[list[dict], dict]:
    budget_tokens = settings.context_budget_tokens if settings.context_budget_tokens > 0 else 0
    reserve_tokens = settings.context_output_reserve_tokens if settings.context_output_reserve_tokens > 0 else 0
    thin_trigger_tokens = settings.context_local_thin_trigger_tokens if settings.context_local_thin_trigger_tokens > 0 else 0
    available_tokens = max(budget_tokens - reserve_tokens, 0) if budget_tokens > 0 else 0
    tokens_before = estimate_tokens(messages)
    governed = list(messages)
    report = {
        "budget_tokens": budget_tokens,
        "reserve_tokens": reserve_tokens,
        "available_tokens": available_tokens,
        "tokens_before": tokens_before,
        "tokens_after": tokens_before,
        "local_thin_applied": False,
        "trimmed_tool_messages": 0,
        "trimmed_assistant_messages": 0,
        "over_budget_after_thin": False,
        "should_compact": False,
    }

    should_thin = False
    if thin_trigger_tokens > 0 and tokens_before > thin_trigger_tokens:
        should_thin = True
    if available_tokens > 0 and tokens_before > available_tokens:
        should_thin = True

    if should_thin:
        governed, thin_stats = _local_thin_messages(messages)
        tokens_after = estimate_tokens(governed)
        report["tokens_after"] = tokens_after
        report["local_thin_applied"] = bool(thin_stats.get("local_thin_applied"))
        report["trimmed_tool_messages"] = int(thin_stats.get("trimmed_tool_messages", 0) or 0)
        report["trimmed_assistant_messages"] = int(thin_stats.get("trimmed_assistant_messages", 0) or 0)
    if available_tokens > 0 and report["tokens_after"] > available_tokens:
        report["over_budget_after_thin"] = True
        report["should_compact"] = True
    return governed, report


def count_user_turns(messages: list[dict]) -> int:
    total = 0
    for msg in messages:
        if msg.get("role") != "user":
            continue
        content = msg.get("content", "")
        if isinstance(content, list):
            content = json.dumps(content, ensure_ascii=False, default=str)
        if _is_compaction_content(str(content or "")):
            continue
        total += 1
    return total


def _is_compaction_content(content: str) -> bool:
    return str(content or "").lstrip().startswith(COMPACTION_HEADER)


def needs_compaction(messages: list[dict], turn_limit: int = 0, context_limit: int = 0) -> bool:
    if not turn_limit:
        turn_limit = settings.summary_trigger_turns
    if not context_limit:
        context_limit = settings.summary_trigger_context_tokens
    if turn_limit > 0 and count_user_turns(messages) > turn_limit:
        return True
    if context_limit > 0 and estimate_tokens(messages) > context_limit:
        return True
    return False


def _local_thin_messages(messages: list[dict]) -> tuple[list[dict], dict]:
    keep_messages = max(int(settings.context_local_keep_messages or 0), 0)
    keep_recent_tools = max(int(settings.context_local_recent_tool_messages or 0), 0)
    tool_char_limit = max(int(settings.context_local_tool_chars or 0), 0)
    assistant_char_limit = max(int(settings.context_local_assistant_chars or 0), 0)
    total = len(messages)
    full_keep_start = max(total - keep_messages, 0)
    tool_indices = [idx for idx, msg in enumerate(messages) if msg.get("role") == "tool"]
    keep_tool_indices = set(tool_indices[-keep_recent_tools:]) if keep_recent_tools > 0 else set()
    trimmed_tool_messages = 0
    trimmed_assistant_messages = 0
    changed = False
    result: list[dict] = []

    for idx, msg in enumerate(messages):
        role = msg.get("role")
        if idx >= full_keep_start or idx in keep_tool_indices:
            result.append(_clone_message(msg))
            continue

        if role == "tool":
            thinned = _thin_tool_message(msg, tool_char_limit)
            if thinned != msg:
                trimmed_tool_messages += 1
                changed = True
            result.append(thinned)
            continue

        if role == "assistant":
            thinned = _thin_assistant_message(msg, assistant_char_limit)
            if thinned != msg:
                trimmed_assistant_messages += 1
                changed = True
            result.append(thinned)
            continue

        result.append(_clone_message(msg))

    return result, {
        "local_thin_applied": changed,
        "trimmed_tool_messages": trimmed_tool_messages,
        "trimmed_assistant_messages": trimmed_assistant_messages,
    }


def _thin_tool_message(msg: dict, limit: int) -> dict:
    item = _clone_message(msg)
    content = str(item.get("content", "") or "")
    if not content:
        return item
    if limit <= 0:
        item["content"] = "[旧工具结果已局部瘦身，请优先参考结构化状态与最近工具结果]"
        return item
    if len(content) <= limit:
        return item
    head = content[: min(limit, max(limit - 120, 200))]
    item["content"] = f"{head}\n\n...[旧工具结果已局部瘦身，共 {len(content)} 字符]"
    return item


def _thin_assistant_message(msg: dict, limit: int) -> dict:
    item = _clone_message(msg)
    content = item.get("content", "")
    if not isinstance(content, str) or not content:
        return item
    if limit <= 0:
        item["content"] = ""
        return item
    if len(content) <= limit:
        return item
    head = content[: min(limit, max(limit - 80, 160))]
    item["content"] = f"{head}\n...[旧 assistant 内容已局部瘦身]"
    return item


def _clone_message(msg: dict) -> dict:
    cloned = dict(msg)
    if isinstance(cloned.get("tool_calls"), list):
        cloned["tool_calls"] = [dict(tc) if isinstance(tc, dict) else tc for tc in cloned["tool_calls"]]
    return cloned
