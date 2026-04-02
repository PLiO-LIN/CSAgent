MAX_STEPS_REMINDER = """你已经执行了较多步骤。请尽快总结当前进展并给出最终回复。
如果任务尚未完成，请告知用户当前状态和后续建议，而不是继续执行更多工具调用。"""

COMPACTION_CONTINUE = """之前的对话因为过长已被压缩为摘要。请基于上面的摘要继续为用户服务。
如果用户有未完成的请求，请主动询问是否继续。"""


def check_reminders(step: int, max_steps: int, compacted: bool) -> str | None:
    """根据当前状态决定是否需要注入提醒。"""
    if compacted:
        return COMPACTION_CONTINUE
    if step >= max_steps - 2:
        return MAX_STEPS_REMINDER
    return None
