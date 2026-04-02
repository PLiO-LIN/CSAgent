from openai import AsyncOpenAI
from provider.base import Provider
from typing import Any

from config import resolve_llm_selection, settings


def create(model_settings: dict[str, Any] | None = None) -> Provider:
    resolved = resolve_llm_selection(model_settings, settings)
    return Provider(
        name=str(resolved.get("vendor_id") or "openai_compatible").strip() or "openai_compatible",
        client=AsyncOpenAI(api_key=resolved.get("api_key") or settings.api_key, base_url=resolved.get("base_url") or settings.base_url),
        model=str(resolved.get("chat_model") or settings.chat_model).strip() or settings.chat_model,
    )
