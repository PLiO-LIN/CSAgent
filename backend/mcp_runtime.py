from __future__ import annotations

import asyncio
from contextlib import AsyncExitStack
from dataclasses import dataclass, field
from datetime import timedelta
import hashlib
import json
import logging
import re
import time
from typing import Any

from mcp import ClientSession, StdioServerParameters, types
from mcp.client.sse import sse_client
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamablehttp_client
from mcp.client.websocket import websocket_client

from config import McpServerSettings, settings
from mcp_card_contract import extract_tool_card_binding, extract_tool_card_type, extract_tool_icons
from tool.base import ToolEntry, ToolPolicy, ToolResult, set_dynamic_tool_provider

logger = logging.getLogger(__name__)


@dataclass
class _ServerConnection:
    name: str
    config: McpServerSettings
    session: ClientSession
    exit_stack: AsyncExitStack
    capabilities: Any = None
    server_info: dict[str, Any] = field(default_factory=dict)
    instructions: str = ""
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class McpToolRuntime:
    def __init__(self) -> None:
        self._entries: dict[str, ToolEntry] = {}
        self._servers: dict[str, _ServerConnection] = {}
        self._init_lock = asyncio.Lock()
        self._initialized = False
        self._last_attempt_at = 0.0
        self._retry_interval_seconds = 30.0
        self._last_failures: dict[str, str] = {}

    def entries(self) -> dict[str, ToolEntry]:
        return dict(self._entries)

    async def ensure_initialized(self, force: bool = False) -> None:
        if not settings.mcp_enabled or not settings.mcp_servers:
            await self._clear_runtime()
            self._initialized = True
            self._last_failures = {}
            return
        now = time.monotonic()
        if not force and self._initialized and (not self._last_failures or now - self._last_attempt_at < self._retry_interval_seconds):
            return
        async with self._init_lock:
            now = time.monotonic()
            if not force and self._initialized and (not self._last_failures or now - self._last_attempt_at < self._retry_interval_seconds):
                return
            self._last_attempt_at = now
            await self._reload_tools()

    async def shutdown(self) -> None:
        await self._clear_runtime()
        self._initialized = False

    async def call_tool(self, server_name: str, tool_name: str, args: dict[str, Any]) -> ToolResult:
        if not settings.mcp_enabled:
            return ToolResult(error="MCP integration is disabled")
        config = settings.mcp_servers.get(server_name)
        if not config or not config.enabled:
            return ToolResult(error=f"MCP server `{server_name}` is not enabled")
        timeout = self._tool_timeout(config)
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                connection = await self._ensure_server(server_name, config, reconnect=attempt > 0)
                async with connection.lock:
                    result = await connection.session.call_tool(
                        tool_name,
                        arguments=dict(args or {}),
                        read_timeout_seconds=timeout,
                    )
                return self._adapt_tool_result(server_name, tool_name, result)
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "MCP tool call failed server=%s tool=%s attempt=%s error=%s",
                    server_name,
                    tool_name,
                    attempt + 1,
                    exc,
                )
                await self._close_server(server_name)
        return ToolResult(error=f"MCP tool `{server_name}:{tool_name}` 调用失败: {last_error}")

    async def _reload_tools(self) -> None:
        active_names = {
            name
            for name, config in settings.mcp_servers.items()
            if isinstance(config, McpServerSettings) and config.enabled
        }
        stale_names = set(self._servers.keys()) - active_names
        for name in stale_names:
            await self._close_server(name)
        new_entries: dict[str, ToolEntry] = {}
        occupied_names: set[str] = set()
        failures: dict[str, str] = {}
        for server_name, config in settings.mcp_servers.items():
            if not config.enabled:
                continue
            try:
                connection = await self._ensure_server(server_name, config)
                server_entries = await self._discover_server_entries(connection, occupied_names)
                new_entries.update(server_entries)
            except Exception as exc:
                failures[server_name] = str(exc)
                logger.warning("MCP server %s initialization failed: %s", server_name, exc)
        self._entries = new_entries
        self._initialized = True
        self._last_failures = failures
        logger.info(
            "MCP runtime initialized: servers=%s tools=%s failures=%s",
            len(active_names),
            len(self._entries),
            len(failures),
        )

    async def _discover_server_entries(
        self,
        connection: _ServerConnection,
        occupied_names: set[str],
    ) -> dict[str, ToolEntry]:
        tools = await self._list_tools(connection)
        entries: dict[str, ToolEntry] = {}
        include = {str(name).strip() for name in connection.config.include_tools if str(name).strip()}
        exclude = {str(name).strip() for name in connection.config.exclude_tools if str(name).strip()}
        for tool in tools:
            raw_name = str(tool.name or "").strip()
            if not raw_name:
                continue
            normalized_name = self._normalize_segment(raw_name)
            if include and raw_name not in include and normalized_name not in include:
                continue
            if raw_name in exclude or normalized_name in exclude:
                continue
            public_name = self._build_public_tool_name(connection.name, raw_name, connection.config, occupied_names)
            policy = self._build_policy(connection.name, connection.config, tool)
            description = self._build_description(connection.name, tool)
            parameters = self._normalize_schema(tool.inputSchema)
            output_schema = self._normalize_json_schema(getattr(tool, "outputSchema", None))
            tool_meta = dict(getattr(tool, "meta", None) or {})
            icons = extract_tool_icons(tool_meta, getattr(tool, "icons", None))

            async def _executor(
                _server_name: str = connection.name,
                _tool_name: str = raw_name,
                **kwargs: Any,
            ) -> ToolResult:
                return await self.call_tool(_server_name, _tool_name, kwargs)

            entries[public_name] = ToolEntry(
                name=public_name,
                title=str(getattr(tool, "title", "") or "").strip(),
                description=description,
                parameters=parameters,
                func=_executor,
                scope=connection.config.scope,
                policy=policy,
                source=f"mcp:{connection.name}",
                output_schema=output_schema,
                metadata={
                    "mcp_protocol_meta": tool_meta,
                    "mcp_raw_tool_name": raw_name,
                },
                icons=icons,
            )
            occupied_names.add(public_name)
        logger.info("MCP server %s discovered %s tools", connection.name, len(entries))
        return entries

    async def _list_tools(self, connection: _ServerConnection) -> list[types.Tool]:
        tools: list[types.Tool] = []
        cursor: str | None = None
        while True:
            async with connection.lock:
                result = await connection.session.list_tools(cursor=cursor)
            tools.extend(list(result.tools or []))
            cursor = result.nextCursor
            if not cursor:
                break
        return tools

    async def _ensure_server(
        self,
        server_name: str,
        config: McpServerSettings,
        reconnect: bool = False,
    ) -> _ServerConnection:
        existing = self._servers.get(server_name)
        if existing and not reconnect:
            return existing
        if existing:
            await self._close_server(server_name)
        connection = await self._connect_server(server_name, config)
        self._servers[server_name] = connection
        return connection

    async def _connect_server(self, server_name: str, config: McpServerSettings) -> _ServerConnection:
        transport = str(config.transport or "stdio").strip().lower() or "stdio"
        exit_stack = AsyncExitStack()
        try:
            if transport == "stdio":
                if not config.command:
                    raise ValueError(f"MCP server `{server_name}` missing command for stdio transport")
                params = StdioServerParameters(
                    command=config.command,
                    args=list(config.args or []),
                    env=dict(config.env or {}) or None,
                    cwd=config.cwd or None,
                )
                read_stream, write_stream = await exit_stack.enter_async_context(stdio_client(params))
            elif transport == "sse":
                if not config.url:
                    raise ValueError(f"MCP server `{server_name}` missing url for sse transport")
                read_stream, write_stream = await exit_stack.enter_async_context(
                    sse_client(
                        config.url,
                        headers=dict(config.headers or {}) or None,
                        timeout=float(config.timeout_seconds or 30.0),
                        sse_read_timeout=float(config.sse_read_timeout_seconds or 300.0),
                    )
                )
            elif transport == "http":
                if not config.url:
                    raise ValueError(f"MCP server `{server_name}` missing url for http transport")
                read_stream, write_stream, _ = await exit_stack.enter_async_context(
                    streamablehttp_client(
                        config.url,
                        headers=dict(config.headers or {}) or None,
                        timeout=float(config.timeout_seconds or 30.0),
                        sse_read_timeout=float(config.sse_read_timeout_seconds or 300.0),
                    )
                )
            elif transport == "ws":
                if not config.url:
                    raise ValueError(f"MCP server `{server_name}` missing url for ws transport")
                if config.headers:
                    raise ValueError("Python MCP websocket transport does not support custom headers")
                read_stream, write_stream = await exit_stack.enter_async_context(websocket_client(config.url))
            else:
                raise ValueError(f"Unsupported MCP transport: {transport}")

            session = await exit_stack.enter_async_context(ClientSession(read_stream, write_stream))
            initialized = await session.initialize()
            server_info = initialized.serverInfo.model_dump(mode="json") if initialized.serverInfo else {}
            connection = _ServerConnection(
                name=server_name,
                config=config,
                session=session,
                exit_stack=exit_stack,
                capabilities=initialized.capabilities,
                server_info=server_info,
                instructions=str(initialized.instructions or "").strip(),
            )
            logger.info("Connected MCP server %s via %s", server_name, transport)
            return connection
        except Exception:
            await exit_stack.aclose()
            raise

    async def _close_server(self, server_name: str) -> None:
        connection = self._servers.pop(server_name, None)
        if not connection:
            return
        try:
            await connection.exit_stack.aclose()
        except Exception:
            logger.exception("Failed to close MCP server %s", server_name)

    async def _clear_runtime(self) -> None:
        self._entries = {}
        names = list(self._servers.keys())
        for name in names:
            await self._close_server(name)

    def _build_policy(self, server_name: str, config: McpServerSettings, tool: types.Tool) -> ToolPolicy:
        annotations = getattr(tool, "annotations", None)
        read_only = bool(getattr(annotations, "readOnlyHint", False))
        destructive = bool(getattr(annotations, "destructiveHint", False))
        risk_level = str(config.risk_level or "auto").strip().lower() or "auto"
        if risk_level == "auto":
            risk_level = "high" if destructive else ("low" if read_only else "medium")
        confirm_policy = str(config.confirm_policy or "auto").strip().lower() or "auto"
        if confirm_policy == "auto":
            confirm_policy = "always" if destructive else ("never" if read_only else "on_risky")
        return ToolPolicy(
            risk_level=risk_level,
            confirm_policy=confirm_policy,
            external_side_effect=not read_only,
            phase_guidance=f"MCP server: {server_name}",
        )

    def _build_description(self, server_name: str, tool: types.Tool) -> str:
        parts: list[str] = []
        title = str(tool.title or "").strip()
        description = str(tool.description or "").strip()
        if title and title != tool.name:
            parts.append(f"显示名: {title}")
        if description:
            parts.append(description)
        parts.append(f"MCP server: {server_name}")
        return " | ".join(part for part in parts if part)

    def _build_public_tool_name(
        self,
        server_name: str,
        tool_name: str,
        config: McpServerSettings,
        occupied_names: set[str],
    ) -> str:
        server_segment = self._normalize_segment(server_name)
        tool_segment = self._normalize_segment(tool_name)
        prefix_template = str(config.tool_name_prefix or "").strip()
        prefix = prefix_template.format(server=server_segment, server_name=server_name) if prefix_template else f"mcp__{server_segment}__"
        candidate = f"{prefix}{tool_segment}"
        if candidate not in occupied_names:
            return candidate
        suffix = self._normalize_segment(tool_name)[:24]
        base = f"{candidate}_{suffix}" if suffix else candidate
        if base not in occupied_names:
            return base
        digest = hashlib.md5(f"{server_name}:{tool_name}".encode("utf-8")).hexdigest()[:8]
        return f"{candidate}_{digest}"

    def _normalize_schema(self, schema: Any) -> dict[str, Any]:
        if not isinstance(schema, dict):
            return {
                "type": "object",
                "properties": {},
                "additionalProperties": True,
            }
        normalized = dict(schema)
        if normalized.get("type") != "object":
            return {
                "type": "object",
                "properties": {},
                "additionalProperties": True,
            }
        properties = normalized.get("properties")
        if not isinstance(properties, dict):
            normalized["properties"] = {}
        if not normalized.get("properties") and "additionalProperties" not in normalized and "patternProperties" not in normalized:
            normalized["additionalProperties"] = True
        return normalized

    def _normalize_json_schema(self, schema: Any) -> dict[str, Any]:
        if not isinstance(schema, dict):
            return {}
        return dict(schema)

    def _normalize_segment(self, value: str) -> str:
        text = re.sub(r"[^0-9A-Za-z_-]+", "_", str(value or "").strip())
        text = re.sub(r"_+", "_", text).strip("_")
        return text or "tool"

    def _tool_timeout(self, config: McpServerSettings) -> timedelta | None:
        seconds = float(config.tool_timeout_seconds or settings.mcp_tool_timeout_seconds or 0.0)
        if seconds <= 0:
            return None
        return timedelta(seconds=seconds)

    def _adapt_tool_result(
        self,
        server_name: str,
        tool_name: str,
        result: types.CallToolResult,
    ) -> ToolResult:
        text = self._render_result_text(result)
        metadata: dict[str, Any] = {
            "mcp_server": server_name,
            "mcp_tool_name": tool_name,
        }
        if result.meta:
            metadata["mcp_meta"] = result.meta
        if result.structuredContent is not None:
            metadata["mcp_structured_content"] = result.structuredContent
        if result.isError:
            return ToolResult(error=text or f"MCP tool `{server_name}:{tool_name}` returned an error", metadata=metadata)
        return ToolResult(text=text or f"MCP tool `{server_name}:{tool_name}` executed successfully.", metadata=metadata)

    def _render_result_text(self, result: types.CallToolResult) -> str:
        blocks: list[str] = []
        for item in result.content or []:
            rendered = self._render_content_item(item)
            if rendered:
                blocks.append(rendered)
        if not blocks and result.structuredContent is not None:
            blocks.append(json.dumps(result.structuredContent, ensure_ascii=False, indent=2))
        return "\n\n".join(block for block in blocks if block).strip()

    def _render_content_item(self, item: Any) -> str:
        item_type = str(getattr(item, "type", "") or "").strip().lower()
        if item_type == "text":
            return str(getattr(item, "text", "") or "").strip()
        if item_type == "image":
            mime_type = str(getattr(item, "mimeType", "image") or "image")
            data = str(getattr(item, "data", "") or "")
            return f"[MCP image output omitted: {mime_type}, {len(data)} base64 chars]"
        if item_type == "resource":
            return self._render_resource(getattr(item, "resource", None))
        model_dump = getattr(item, "model_dump", None)
        if callable(model_dump):
            return json.dumps(model_dump(mode="json"), ensure_ascii=False, indent=2)
        return str(item).strip()

    def _render_resource(self, resource: Any) -> str:
        if resource is None:
            return ""
        text = getattr(resource, "text", None)
        if isinstance(text, str) and text.strip():
            return text.strip()
        blob = getattr(resource, "blob", None)
        if blob:
            mime_type = str(getattr(resource, "mimeType", "application/octet-stream") or "application/octet-stream")
            return f"[MCP binary resource output omitted: {mime_type}, {len(str(blob))} base64 chars]"
        model_dump = getattr(resource, "model_dump", None)
        if callable(model_dump):
            payload = model_dump(mode="json")
            if isinstance(payload, dict):
                uri = str(payload.get("uri", "") or "").strip()
                mime_type = str(payload.get("mimeType", "") or "").strip()
                label = uri or str(payload.get("name", "") or "").strip() or "resource"
                return f"[MCP resource output: {label}{f' ({mime_type})' if mime_type else ''}]"
            return json.dumps(payload, ensure_ascii=False, indent=2)
        return str(resource).strip()


_runtime = McpToolRuntime()
set_dynamic_tool_provider(_runtime.entries)


async def ensure_mcp_tools_loaded(force: bool = False) -> None:
    await _runtime.ensure_initialized(force=force)


async def shutdown_mcp_runtime() -> None:
    await _runtime.shutdown()


async def inspect_mcp_server(server_name: str, config: McpServerSettings) -> dict[str, Any]:
    runtime = McpToolRuntime()
    target_name = str(server_name or "probe").strip() or "probe"
    connection: _ServerConnection | None = None
    try:
        connection = await runtime._connect_server(target_name, config)
        entries = await runtime._discover_server_entries(connection, occupied_names=set())
        tools: list[dict[str, Any]] = []
        for entry in sorted(entries.values(), key=lambda item: item.name):
            runtime_meta = dict(getattr(entry, "metadata", {}) or {})
            protocol_meta = dict(runtime_meta.get("mcp_protocol_meta", {}) or {})
            tools.append({
                "public_name": entry.name,
                "raw_name": str(runtime_meta.get("mcp_raw_tool_name", "") or "").strip(),
                "title": str(getattr(entry, "title", "") or "").strip(),
                "description": str(getattr(entry, "description", "") or ""),
                "input_schema": dict(getattr(entry, "parameters", {}) or {}),
                "output_schema": dict(getattr(entry, "output_schema", {}) or {}),
                "scope": str(getattr(entry, "scope", "global") or "global"),
                "icons": [dict(item) for item in (getattr(entry, "icons", None) or []) if isinstance(item, dict)],
                "meta_keys": sorted(protocol_meta.keys()),
                "supports_card": bool(extract_tool_card_binding(protocol_meta)),
                "card_type": extract_tool_card_type(protocol_meta),
            })
        return {
            "ok": True,
            "server_name": target_name,
            "transport": str(config.transport or "stdio").strip().lower() or "stdio",
            "server_info": dict(connection.server_info or {}),
            "instructions": str(connection.instructions or ""),
            "count": len(tools),
            "tools": tools,
        }
    finally:
        if connection is not None:
            try:
                await connection.exit_stack.aclose()
            except Exception:
                logger.exception("Failed to close probed MCP server %s", target_name)
