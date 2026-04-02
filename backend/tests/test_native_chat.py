from app.runtime.native_chat import chat_blocking

import asyncio


def test_native_chat_blocking_shape():
    payload = {
        "session_id": "",
        "content": "帮我看看当前有哪些插件",
        "phone": "18018609133",
        "client_meta": {},
        "stream": False,
    }
    data = asyncio.run(chat_blocking(payload))
    assert data["mode"] == "blocking"
    assert "session_id" in data
    assert data["reply"]["finish_reason"] in {"done", "error", "unknown"}
