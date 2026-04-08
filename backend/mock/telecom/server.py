"""
电信客服模拟 MCP 服务器
~~~~~~~~~~~~~~~~~~~~~~
基于 FastMCP 实现，提供以下工具：
  - query_customer_info   客户信息查询
  - query_balance          余额查询
  - query_package_usage    套餐用量查询
  - query_bill             账单查询
  - query_points           积分查询
  - query_subscriptions    订购关系查询
  - recommend_packages     套餐推荐
  - submit_order           订购下单
  - search_knowledge       知识库搜索

启动方式:
  python -m backend.mock.telecom.server          # 默认 SSE, port 9100
  python -m backend.mock.telecom.server --stdio   # stdio 模式
"""
import argparse
import asyncio
import base64
import inspect
import json
import os
import sys
from contextlib import AsyncExitStack
from typing import Any

import anyio
import jsonschema

# 确保项目根目录在 sys.path 中
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from mcp import types
from mcp.server import Server
from mcp.server.sse import SseServerTransport
from mcp.server.stdio import stdio_server
from mcp.server.streamable_http import StreamableHTTPServerTransport
from starlette.responses import PlainTextResponse

from backend.mcp_card_contract import CSAGENT_CARD_META_KEY, CSAGENT_ICONS_META_KEY
from backend.mock.telecom.mock_data import (
    get_user,
    get_balance,
    get_package_usage,
    get_bill,
    get_points,
    get_subscriptions,
    recommend_packages as _recommend,
    submit_order as _submit_order,
    search_knowledge as _search_knowledge,
)

def _annotation_to_schema(annotation: Any) -> dict[str, Any]:
    if annotation in {inspect.Signature.empty, Any}:
        return {}
    if annotation is str:
        return {"type": "string"}
    if annotation is int:
        return {"type": "integer"}
    if annotation is float:
        return {"type": "number"}
    if annotation is bool:
        return {"type": "boolean"}
    return {}


def _build_input_schema(func: Any) -> dict[str, Any]:
    properties: dict[str, dict[str, Any]] = {}
    required: list[str] = []
    for name, param in inspect.signature(func).parameters.items():
        if param.kind not in {inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY}:
            continue
        schema = dict(_annotation_to_schema(param.annotation))
        if param.default is inspect.Signature.empty:
            required.append(name)
        elif isinstance(param.default, (str, int, float, bool)) or param.default is None:
            schema["default"] = param.default
        properties[name] = schema
    payload: dict[str, Any] = {
        "type": "object",
        "properties": properties,
        "additionalProperties": False,
    }
    if required:
        payload["required"] = required
    return payload


class _CompatMCP:
    def __init__(self, name: str, instructions: str = "") -> None:
        self.server = Server(name, instructions=instructions)
        self.sse_transport = SseServerTransport("/messages")
        self._tools: list[types.Tool] = []
        self._handlers: dict[str, Any] = {}
        self._streamable_http_transport: StreamableHTTPServerTransport | None = None
        self._app_exit_stack: AsyncExitStack | None = None

        @self.server.list_tools()
        async def _list_tools() -> list[types.Tool]:
            return list(self._tools)

        self.server.request_handlers[types.CallToolRequest] = self._handle_call_tool_request

    async def _handle_call_tool_request(self, req: types.CallToolRequest) -> types.ServerResult:
        try:
            tool_name = str(req.params.name or "").strip()
            arguments = dict(req.params.arguments or {})
            tool = await self.server._get_cached_tool_definition(tool_name)
            if tool is None:
                raise ValueError(f"Unknown tool: {tool_name}")
            try:
                jsonschema.validate(instance=arguments, schema=tool.inputSchema)
            except jsonschema.ValidationError as exc:
                return self.server._make_error_result(f"Input validation error: {exc.message}")
            handler = self._handlers.get(tool_name)
            if handler is None:
                raise ValueError(f"Unknown tool: {tool_name}")
            result = handler(**arguments)
            if inspect.isawaitable(result):
                result = await result
            return types.ServerResult(self._normalize_tool_result(tool, result))
        except Exception as exc:
            return self.server._make_error_result(str(exc))

    def _normalize_tool_result(self, tool: types.Tool | None, result: Any) -> types.CallToolResult:
        if isinstance(result, types.CallToolResult):
            normalized = result
        else:
            structured_content: dict[str, Any] | None
            if isinstance(result, tuple) and len(result) == 2:
                unstructured_raw, structured_content = result
                if not isinstance(structured_content, dict):
                    raise ValueError("Structured output must be a JSON object")
                unstructured_content = list(unstructured_raw)
            elif isinstance(result, dict):
                structured_content = dict(result)
                unstructured_content = [
                    types.TextContent(
                        type="text",
                        text=json.dumps(structured_content, ensure_ascii=False, indent=2),
                    )
                ]
            elif isinstance(result, (str, int, float, bool)) or result is None:
                structured_content = {"result": result}
                unstructured_content = [
                    types.TextContent(
                        type="text",
                        text=json.dumps(structured_content, ensure_ascii=False, indent=2),
                    )
                ]
            elif hasattr(result, "__iter__"):
                structured_content = None
                unstructured_content = list(result)
            else:
                raise ValueError(f"Unexpected return type from tool: {type(result).__name__}")
            normalized = types.CallToolResult(
                content=list(unstructured_content),
                structuredContent=structured_content,
                isError=False,
            )
        if tool and tool.outputSchema is not None:
            if normalized.structuredContent is None:
                raise ValueError("Output validation error: outputSchema defined but no structured output returned")
            try:
                jsonschema.validate(instance=normalized.structuredContent, schema=tool.outputSchema)
            except jsonschema.ValidationError as exc:
                raise ValueError(f"Output validation error: {exc.message}") from exc
        return normalized

    def tool(
        self,
        name: str | None = None,
        title: str | None = None,
        description: str | None = None,
        meta: dict[str, Any] | None = None,
        annotations: types.ToolAnnotations | None = None,
        structured_output: bool | None = None,
        **_: Any,
    ):
        def decorator(func: Any) -> Any:
            tool_name = str(name or func.__name__).strip()
            tool = types.Tool(
                name=tool_name,
                title=str(title or "").strip() or None,
                description=str(description or "").strip() or None,
                inputSchema=_build_input_schema(func),
                outputSchema={"type": "object"} if structured_output is not False else None,
                annotations=annotations,
                _meta=dict(meta or {}),
            )
            self._tools.append(tool)
            self._handlers[tool_name] = func
            return func

        return decorator

    async def run_stdio(self) -> None:
        async with stdio_server() as (read_stream, write_stream):
            await self.server.run(read_stream, write_stream, self.server.create_initialization_options())

    async def _startup(self) -> None:
        if self._app_exit_stack is not None:
            return
        exit_stack = AsyncExitStack()
        try:
            transport = StreamableHTTPServerTransport(
                mcp_session_id=None,
                is_json_response_enabled=True,
            )
            task_group = await exit_stack.enter_async_context(anyio.create_task_group())
            read_stream, write_stream = await exit_stack.enter_async_context(transport.connect())
            self._streamable_http_transport = transport

            async def _run_streamable_http() -> None:
                await self.server.run(
                    read_stream,
                    write_stream,
                    self.server.create_initialization_options(),
                    stateless=True,
                )

            task_group.start_soon(_run_streamable_http)
            self._app_exit_stack = exit_stack
        except Exception:
            self._streamable_http_transport = None
            await exit_stack.aclose()
            raise

    async def _shutdown(self) -> None:
        exit_stack = self._app_exit_stack
        self._app_exit_stack = None
        transport = self._streamable_http_transport
        self._streamable_http_transport = None
        if transport is not None:
            terminate = getattr(transport, "terminate", None)
            if callable(terminate):
                maybe_result = terminate()
                if inspect.isawaitable(maybe_result):
                    await maybe_result
        if exit_stack is not None:
            await exit_stack.aclose()

    async def _handle_lifespan(self, receive: Any, send: Any) -> None:
        while True:
            message = await receive()
            message_type = str(message.get("type") or "")
            if message_type == "lifespan.startup":
                try:
                    await self._startup()
                except Exception as exc:
                    await send({"type": "lifespan.startup.failed", "message": str(exc)})
                    return
                await send({"type": "lifespan.startup.complete"})
                continue
            if message_type == "lifespan.shutdown":
                try:
                    await self._shutdown()
                except Exception as exc:
                    await send({"type": "lifespan.shutdown.failed", "message": str(exc)})
                    return
                await send({"type": "lifespan.shutdown.complete"})
                return

    async def asgi_app(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") == "lifespan":
            await self._handle_lifespan(receive, send)
            return
        if scope.get("type") != "http":
            response = PlainTextResponse("Unsupported scope type", status_code=500)
            await response(scope, receive, send)
            return
        method = str(scope.get("method") or "").upper()
        path = str(scope.get("path") or "").rstrip("/") or "/"
        if path == "/" and method == "GET":
            response = PlainTextResponse("telecom-mock MCP server ready: /sse /mcp", status_code=200)
            await response(scope, receive, send)
            return
        if path == "/sse" and method == "GET":
            async with self.sse_transport.connect_sse(scope, receive, send) as (read_stream, write_stream):
                await self.server.run(read_stream, write_stream, self.server.create_initialization_options())
            return
        if path == "/messages" and method == "POST":
            await self.sse_transport.handle_post_message(scope, receive, send)
            return
        if path == "/mcp":
            transport = self._streamable_http_transport
            if transport is None:
                response = PlainTextResponse("Streamable HTTP transport not initialized", status_code=503)
                await response(scope, receive, send)
                return
            await transport.handle_request(scope, receive, send)
            return
        response = PlainTextResponse("Not Found", status_code=404)
        await response(scope, receive, send)


mcp = _CompatMCP(
    "telecom-mock",
    instructions="电信客服模拟 MCP 服务器，提供客户查询、余额、用量、账单、积分、订购、推荐、下单、知识库搜索等工具。",
)


async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:
    await mcp.asgi_app(scope, receive, send)


def _icon_payload(label: str, color: str) -> dict[str, Any]:
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<rect width="64" height="64" rx="16" fill="{color}"/>'
        f'<text x="32" y="40" text-anchor="middle" font-size="24" font-family="Arial, sans-serif" fill="#ffffff">{label}</text>'
        '</svg>'
    )
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return {
        "src": f"data:image/svg+xml;base64,{encoded}",
        "mimeType": "image/svg+xml",
        "sizes": ["any"],
    }


def _tool_icons(label: str, color: str) -> list[Any] | None:
    icon_cls = getattr(types, "Icon", None)
    if icon_cls is None:
        return None
    payload = _icon_payload(label, color)
    return [icon_cls(src=payload["src"], mimeType=payload["mimeType"], sizes=payload["sizes"])]


def _tool_annotations(
    read_only: bool = True,
    destructive: bool = False,
    idempotent: bool | None = None,
) -> types.ToolAnnotations:
    return types.ToolAnnotations(
        readOnlyHint=bool(read_only),
        destructiveHint=bool(destructive),
        idempotentHint=(not destructive) if idempotent is None else bool(idempotent),
        openWorldHint=False,
    )


def _tool_contract(
    title: str,
    description: str,
    icon_label: str,
    icon_color: str,
    template_id: str = "",
    card_type: str = "",
    read_only: bool = True,
    destructive: bool = False,
    idempotent: bool | None = None,
) -> dict[str, Any]:
    icon_payload = _icon_payload(icon_label, icon_color)
    meta: dict[str, Any] = {
        CSAGENT_ICONS_META_KEY: [icon_payload],
    }
    if template_id:
        meta[CSAGENT_CARD_META_KEY] = {
            "version": 1,
            "mode": "template_payload",
            "templateId": template_id,
            "cardType": card_type or template_id,
            "source": "structuredContent",
        }
    return {
        "title": title,
        "description": description,
        "meta": meta,
        "annotations": _tool_annotations(read_only=read_only, destructive=destructive, idempotent=idempotent),
        "structured_output": True,
    }


def _fen_text(value: Any) -> str:
    try:
        return f"¥{float(value) / 100:.2f}"
    except (TypeError, ValueError):
        return str(value or "")


@mcp.tool(**_tool_contract(
    title="客户信息查询",
    description="查询客户基本信息。输入手机号，返回客户姓名、账户编号、关联设备、地址等。",
    icon_label="C",
    icon_color="#2563eb",
    template_id="telecom_customer_info",
    card_type="telecom_customer_info",
))
def query_customer_info(phone: str) -> dict[str, Any]:
    user = get_user(phone)
    if not user:
        return {
            "phone": phone,
            "title": "客户信息",
            "summary": f"未找到手机号 {phone} 的客户信息",
            "fields": [
                {"label": "手机号", "value": phone},
                {"label": "状态", "value": "未找到客户"},
            ],
        }
    result = {
        "phone": phone,
        "custName": user["custName"],
        "custId": user["custId"],
        "custNumber": user["custNumber"],
        "acctCd": user["acctCd"],
        "contactAddr": user["contactAddr"],
        "addressDesc": user["addressDesc"],
        "email": user["email"],
        "billingType": user["billingType"],
        "statusCd": user["statusCd"],
        "prodName": user["prodName"],
        "devices": user["prodDevices"],
        "_summary": (
            f"客户 {user['custName']}，手机号 {phone}，"
            f"账户 {user['acctCd']}，{user['billingType'].split('|')[0]}，"
            f"状态 {user['statusCd'].split('|')[0]}，"
            f"关联设备 {len(user['prodDevices'])} 个"
        ),
    }
    return {
        **result,
        "title": "客户信息",
        "summary": result["_summary"],
        "fields": [
            {"label": "姓名", "value": result["custName"]},
            {"label": "手机号", "value": result["phone"]},
            {"label": "客户编号", "value": result["custNumber"]},
            {"label": "账户编号", "value": result["acctCd"]},
            {"label": "付费方式", "value": result["billingType"]},
            {"label": "状态", "value": result["statusCd"]},
            {"label": "产品类型", "value": result["prodName"]},
            {"label": "联系地址", "value": result["contactAddr"]},
            {"label": "邮箱", "value": result["email"]},
        ],
    }


@mcp.tool(**_tool_contract(
    title="余额查询",
    description="查询话费余额。输入手机号，返回话费总余额、专用余额、通用余额、欠费等信息。金额单位为分。",
    icon_label="B",
    icon_color="#0f766e",
    template_id="telecom_balance",
    card_type="telecom_balance",
))
def query_balance(phone: str) -> dict[str, Any]:
    result = get_balance(phone)
    return {
        **result,
        "title": "话费余额",
        "summary": result["_summary"],
        "metrics": [
            {"label": "总余额", "value": _fen_text(result.get("show_ye")), "hint": "专用 + 通用"},
            {"label": "专用余额", "value": _fen_text(result.get("show_ye_zy"))},
            {"label": "通用余额", "value": _fen_text(result.get("show_ye_ty"))},
            {"label": "欠费", "value": _fen_text(result.get("shouldCharge"))},
        ],
    }


@mcp.tool(**_tool_contract(
    title="套餐用量查询",
    description="查询套餐用量。输入手机号和月份(YYYYMM格式，留空为当月)，返回流量、语音、短信用量汇总。",
    icon_label="U",
    icon_color="#7c3aed",
    template_id="telecom_package_usage",
    card_type="telecom_package_usage",
))
def query_package_usage(phone: str, month: str = "") -> dict[str, Any]:
    result = get_package_usage(phone, month or None)
    usage_fields = [
        {
            "label": item.get("grounName", "用量项"),
            "value": f"{item.get('show_used_value', '0')} / {item.get('show_all_value', '0')} {item.get('unit', '')} ({item.get('percent', '0%')})",
        }
        for item in result.get("usageSummary", [])
    ]
    return {
        **result,
        "title": f"套餐用量 - {result.get('month', '')}",
        "summary": result["_summary"],
        "fields": usage_fields,
    }


@mcp.tool(**_tool_contract(
    title="账单查询",
    description="查询账单。输入手机号和起止月份(YYYY-MM格式，留空为上月)，返回账单金额、支付状态。",
    icon_label="I",
    icon_color="#dc2626",
    template_id="telecom_bill",
    card_type="telecom_bill",
))
def query_bill(phone: str, from_month: str = "", to_month: str = "") -> dict[str, Any]:
    result = get_bill(phone, from_month or None, to_month or None)
    first_bill = result.get("bills", [{}])[0] if isinstance(result.get("bills"), list) and result.get("bills") else {}
    return {
        **result,
        "title": f"账单 - {str(first_bill.get('fromDate', '')).split('-01')[0] or from_month or to_month or '最近账期'}",
        "summary": result["_summary"],
        "metrics": [
            {"label": "账单金额", "value": f"¥{first_bill.get('newCharge_yuan', '0.00')}"},
            {"label": "已支付", "value": _fen_text(abs(first_bill.get('totalPaid', 0)))},
            {"label": "欠费", "value": _fen_text(first_bill.get('balanceDue', 0))},
            {"label": "状态", "value": first_bill.get('status_text', '未知')},
        ],
    }


@mcp.tool(**_tool_contract(
    title="积分查询",
    description="查询积分信息。输入手机号，返回总积分、可用积分、已用积分、本月新增、即将清零积分等。",
    icon_label="P",
    icon_color="#ea580c",
    template_id="telecom_balance",
    card_type="telecom_balance",
))
def query_points(phone: str) -> dict[str, Any]:
    result = get_points(phone)
    return {
        **result,
        "title": "积分信息",
        "summary": result["_summary"],
        "metrics": [
            {"label": "可用积分", "value": str(result.get("useablePoints", 0))},
            {"label": "总积分", "value": str(result.get("sumPoints", 0))},
            {"label": "已用积分", "value": str(result.get("usedPoints", 0))},
            {"label": "本月新增", "value": str(result.get("currMonthPoints", 0))},
        ],
    }


@mcp.tool(**_tool_contract(
    title="订购关系查询",
    description="查询订购关系。输入手机号，返回当前在用的所有套餐和可选包列表（含状态、生效/失效时间）。",
    icon_label="S",
    icon_color="#0891b2",
))
def query_subscriptions(phone: str) -> dict[str, Any]:
    result = get_subscriptions(phone)
    return result


@mcp.tool(**_tool_contract(
    title="套餐推荐",
    description="套餐推荐。输入手机号和需求类型(可选: 流量/语音/家庭/低价/全部)，返回推荐套餐列表。",
    icon_label="R",
    icon_color="#16a34a",
    template_id="telecom_recommend",
    card_type="telecom_recommend",
))
def recommend_packages_tool(phone: str, need_type: str = "") -> dict[str, Any]:
    result = _recommend(phone, need_type or None)
    items = []
    for offer in result.get("recommendations", []):
        if not isinstance(offer, dict):
            continue
        items.append({
            "title": str(offer.get("offerName") or "推荐套餐"),
            "summary": "；".join(
                part for part in [
                    offer.get("data"),
                    offer.get("voice"),
                    offer.get("highlights"),
                ]
                if str(part or "").strip() and str(part).strip() != "—"
            ),
            "badges": [
                badge for badge in [offer.get("monthlyFee"), offer.get("suitableFor")]
                if str(badge or "").strip() and str(badge).strip() != "—"
            ],
        })
    return {
        **result,
        "title": "套餐推荐",
        "summary": result["_summary"],
        "items": items,
    }


@mcp.tool(**_tool_contract(
    title="订购下单",
    description="订购下单。输入手机号、产品ID和产品名称，提交订购。返回订单号和状态。",
    icon_label="O",
    icon_color="#be123c",
    read_only=False,
    destructive=True,
    idempotent=False,
))
def submit_order(phone: str, offer_id: str, offer_name: str = "") -> dict[str, Any]:
    result = _submit_order(phone, offer_id, offer_name or None)
    return result


@mcp.tool(**_tool_contract(
    title="知识库搜索",
    description="知识库搜索。输入查询关键词，在电信业务知识库中检索相关问答。返回最相关的结果列表。",
    icon_label="K",
    icon_color="#475569",
))
def search_knowledge(query: str, top_k: int = 5) -> dict[str, Any]:
    result = _search_knowledge(query, top_k)
    return result


# ── 入口 ─────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="电信客服模拟 MCP 服务器")
    parser.add_argument("--stdio", action="store_true", help="使用 stdio 传输")
    parser.add_argument("--port", type=int, default=9100, help="SSE 端口 (默认 9100)")
    args = parser.parse_args()

    if args.stdio:
        asyncio.run(mcp.run_stdio())
    else:
        import uvicorn
        print(f"🚀 电信客服模拟 MCP 服务器启动: SSE=http://127.0.0.1:{args.port}/sse  HTTP=http://127.0.0.1:{args.port}/mcp")
        uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info", interface="asgi3")


if __name__ == "__main__":
    main()
