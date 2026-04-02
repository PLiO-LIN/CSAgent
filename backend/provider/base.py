import json
import logging
from typing import AsyncIterator
from dataclasses import dataclass, field
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


@dataclass
class Message:
    role: str  # system / user / assistant / tool
    content: str = ""
    tool_calls: list[dict] | None = None
    tool_call_id: str | None = None
    name: str | None = None


@dataclass
class ToolDef:
    name: str
    description: str
    parameters: dict  # JSON Schema
    require_confirm: bool = False


@dataclass
class StreamEvent:
    type: str  # text_delta / thinking_delta / tool_call / finish / error
    content: str = ""
    tool_call: dict | None = None
    tokens: tuple[int, int] = (0, 0)


@dataclass
class Provider:
    name: str
    client: AsyncOpenAI
    model: str
    _defaults: dict = field(default_factory=dict)

    async def stream(
        self,
        system: list[str],
        messages: list[dict],
        tools: list[ToolDef] | None = None,
        temperature: float = 0.7,
    ) -> AsyncIterator[StreamEvent]:
        sys_text = "\n\n".join([s for s in system if s]).strip()
        sys_msgs = [{"role": "system", "content": sys_text}] if sys_text else []
        oai_tools = None
        if tools:
            oai_tools = [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    },
                }
                for t in tools
            ]

        kwargs: dict = {
            "model": self.model,
            "messages": sys_msgs + messages,
            "temperature": temperature,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if oai_tools:
            kwargs["tools"] = oai_tools
            kwargs["tool_choice"] = "auto"

        # ---- 请求日志 ----
        tool_names = [t["function"]["name"] for t in (oai_tools or [])]
        msg_summary = []
        for m in kwargs["messages"]:
            role = m.get("role", "?")
            c = m.get("content", "")
            preview = (c[:120] + "...") if len(c) > 120 else c
            msg_summary.append(f"  [{role}] {preview}")
        logger.info(
            "LLM请求 model=%s msgs=%d tools=%s\n%s",
            self.model, len(kwargs["messages"]), tool_names, "\n".join(msg_summary),
        )
        logger.debug("LLM完整请求:\n%s", json.dumps(kwargs, ensure_ascii=False, default=str)[:8000])

        pending_calls: dict[int, dict] = {}
        try:
            resp = await self.client.chat.completions.create(**kwargs)
            async for chunk in resp:
                if not chunk.choices and chunk.usage:
                    yield StreamEvent(
                        type="finish",
                        tokens=(chunk.usage.prompt_tokens, chunk.usage.completion_tokens),
                    )
                    continue
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                # reasoning/thinking content (Qwen3 等模型支持)
                reasoning = getattr(delta, "reasoning_content", None)
                if reasoning:
                    yield StreamEvent(type="thinking_delta", content=reasoning)
                if delta.content:
                    yield StreamEvent(type="text_delta", content=delta.content)
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in pending_calls:
                            pending_calls[idx] = {"id": tc.id or "", "name": "", "arguments": ""}
                        if tc.id:
                            pending_calls[idx]["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                pending_calls[idx]["name"] = tc.function.name
                            if tc.function.arguments:
                                pending_calls[idx]["arguments"] += tc.function.arguments
                if chunk.choices[0].finish_reason == "tool_calls":
                    for call in pending_calls.values():
                        yield StreamEvent(type="tool_call", tool_call=call)
                    pending_calls.clear()
                if chunk.choices[0].finish_reason == "stop":
                    yield StreamEvent(type="finish")
        except Exception as e:
            yield StreamEvent(type="error", content=str(e))
