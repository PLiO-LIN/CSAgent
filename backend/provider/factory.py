from openai import AsyncOpenAI
from provider.base import Provider
from config import settings


def create() -> Provider:
    return Provider(
        name="siliconflow",
        client=AsyncOpenAI(api_key=settings.api_key, base_url=settings.base_url),
        model=settings.chat_model,
    )
