from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from card.runtime import build_template_card
from db.engine import get_db
from platform_registry import (
    CardPackResult,
    CardPackSummary,
    PlatformAgentRecord,
    PlatformCardCollectionRecord,
    PlatformCardTemplateRecord,
    PlatformSkillRecord,
    PlatformToolRecord,
    delete_agent_record,
    delete_card_collection_record,
    delete_card_template_record,
    delete_skill_record,
    delete_tool_record,
    export_card_pack_payload,
    get_agent_record,
    get_card_pack_template_payload,
    get_card_collection_record,
    get_card_template_record,
    get_registry_snapshot,
    import_card_pack,
    list_card_pack_summaries,
    list_agent_records,
    list_card_collection_records,
    list_card_template_records,
    list_skill_records,
    list_tool_records,
    publish_agent,
    scan_card_packs_directory,
    sync_local_tools_into_registry,
    sync_mcp_tools_into_registry,
    upsert_agent_record,
    upsert_card_collection_record,
    upsert_card_template_record,
    upsert_skill_record,
    upsert_tool_record,
)
from provider.factory import create as create_provider

router = APIRouter(prefix="/api/platform", tags=["platform"])


class CardPreviewReq(BaseModel):
    template: PlatformCardTemplateRecord
    source_payload: dict[str, Any] = Field(default_factory=dict)
    binding: dict[str, Any] = Field(default_factory=dict)


class SkillGenerateReq(BaseModel):
    skill_name: str = ""
    display_name: str = ""
    tool_names: list[str] = Field(default_factory=list)
    model_vendor_id: str = ""
    model_id: str = ""
    current_summary: str = ""
    current_document_md: str = ""


SKILL_SUMMARY_START = "[[SUMMARY]]"
SKILL_SUMMARY_END = "[[/SUMMARY]]"
SKILL_BODY_START = "[[BODY]]"
SKILL_BODY_END = "[[/BODY]]"


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _extract_skill_sections(text: str) -> tuple[str, str]:
    raw = str(text or "")
    summary = ""
    body = ""
    if SKILL_SUMMARY_START in raw:
        summary = raw.split(SKILL_SUMMARY_START, 1)[1]
        summary = summary.split(SKILL_SUMMARY_END, 1)[0] if SKILL_SUMMARY_END in summary else summary
    if SKILL_BODY_START in raw:
        body = raw.split(SKILL_BODY_START, 1)[1]
        body = body.split(SKILL_BODY_END, 1)[0] if SKILL_BODY_END in body else body
    return summary.lstrip("\r\n"), body.lstrip("\r\n")


def _finalize_skill_sections(text: str) -> tuple[str, str]:
    summary, body = _extract_skill_sections(text)
    summary = summary.strip()
    body = body.strip()
    if summary or body:
        if not summary and body:
            summary = body.splitlines()[0].strip()[:120]
        if not body:
            body = text.strip()
        return summary, body
    cleaned = str(text or "").strip()
    if not cleaned:
        return "", ""
    lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    fallback_summary = lines[0][:120] if lines else ""
    return fallback_summary, cleaned


def _build_skill_generation_context(payload: SkillGenerateReq) -> tuple[str, list[dict[str, Any]]]:
    skill_name = str(payload.skill_name or "").strip()
    display_name = str(payload.display_name or "").strip() or skill_name
    tool_map = {item.tool_name: item for item in list_tool_records(include_disabled=True)}
    tool_records = [tool_map[name] for name in payload.tool_names if name in tool_map]
    tool_blocks: list[str] = []
    for item in tool_records:
        input_properties = list((item.input_schema or {}).get("properties", {}).keys()) if isinstance(item.input_schema, dict) else []
        output_properties = list((item.output_schema or {}).get("properties", {}).keys()) if isinstance(item.output_schema, dict) else []
        tool_blocks.append(
            "\n".join([
                f"- tool_name: {item.tool_name}",
                f"  display_name: {item.display_name or item.tool_name}",
                f"  summary: {item.summary or '未填写'}",
                f"  scope: {item.scope or 'skill'}",
                f"  provider_type: {item.provider_type or 'local'}",
                f"  supports_card: {'true' if item.supports_card else 'false'}",
                f"  card_type: {item.card_type or '无'}",
                f"  input_fields: {', '.join(input_properties) if input_properties else '无'}",
                f"  output_fields: {', '.join(output_properties) if output_properties else '无'}",
            ])
        )
    context = "\n\n".join([
        f"技能名称: {skill_name}",
        f"展示名称: {display_name}",
        f"绑定工具数: {len(tool_records)}",
        "绑定工具详情:\n" + ("\n\n".join(tool_blocks) if tool_blocks else "- 无可用工具详情"),
        f"已有摘要(如有):\n{str(payload.current_summary or '').strip() or '无'}",
        f"已有正文(如有):\n{str(payload.current_document_md or '').strip() or '无'}",
    ])
    return context, [{
        "role": "user",
        "content": context,
    }]


@router.get("/snapshot")
async def platform_snapshot(db: AsyncSession = Depends(get_db)):
    return await get_registry_snapshot(db)


@router.get("/tools")
async def platform_tools(include_disabled: bool = False):
    return [record.model_dump(by_alias=True) for record in list_tool_records(include_disabled=include_disabled)]


@router.post("/tools/sync/local")
async def sync_local_tools(db: AsyncSession = Depends(get_db)):
    records = await sync_local_tools_into_registry(db)
    return {"count": len(records), "tools": [record.model_dump(by_alias=True) for record in records]}


@router.post("/tools/sync/mcp")
async def sync_mcp_tools(db: AsyncSession = Depends(get_db)):
    records = await sync_mcp_tools_into_registry(db, force=True)
    return {"count": len(records), "tools": [record.model_dump(by_alias=True) for record in records]}


@router.post("/tools")
async def create_tool(payload: PlatformToolRecord, db: AsyncSession = Depends(get_db)):
    record = await upsert_tool_record(db, payload)
    return record.model_dump(by_alias=True)


@router.put("/tools/{tool_name}")
async def update_tool(tool_name: str, payload: PlatformToolRecord, db: AsyncSession = Depends(get_db)):
    data = payload.model_copy(update={"tool_name": tool_name})
    record = await upsert_tool_record(db, data)
    return record.model_dump(by_alias=True)


@router.delete("/tools/{tool_name}")
async def delete_tool(tool_name: str, db: AsyncSession = Depends(get_db)):
    deleted = await delete_tool_record(db, tool_name)
    if not deleted:
        raise HTTPException(status_code=404, detail="Tool not found")
    return {"ok": True, "tool_name": tool_name}


@router.get("/card-collections")
async def platform_card_collections(include_disabled: bool = False):
    return [record.model_dump(by_alias=True) for record in list_card_collection_records(include_disabled=include_disabled)]


@router.get("/card-collections/{collection_id}")
async def platform_card_collection(collection_id: str):
    record = get_card_collection_record(collection_id)
    if not record:
        raise HTTPException(status_code=404, detail="Card collection not found")
    return record.model_dump(by_alias=True)


@router.post("/card-collections")
async def create_card_collection(payload: PlatformCardCollectionRecord, db: AsyncSession = Depends(get_db)):
    record = await upsert_card_collection_record(db, payload)
    return record.model_dump(by_alias=True)


@router.put("/card-collections/{collection_id}")
async def update_card_collection(collection_id: str, payload: PlatformCardCollectionRecord, db: AsyncSession = Depends(get_db)):
    data = payload.model_copy(update={"collection_id": collection_id})
    record = await upsert_card_collection_record(db, data)
    return record.model_dump(by_alias=True)


@router.delete("/card-collections/{collection_id}")
async def delete_card_collection(collection_id: str, db: AsyncSession = Depends(get_db)):
    try:
        deleted = await delete_card_collection_record(db, collection_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Card collection not found")
    return {"ok": True, "collection_id": collection_id}


@router.get("/card-templates")
async def platform_card_templates(include_disabled: bool = False):
    return [record.model_dump(by_alias=True) for record in list_card_template_records(include_disabled=include_disabled)]


@router.get("/card-templates/{template_id}")
async def platform_card_template(template_id: str):
    record = get_card_template_record(template_id)
    if not record:
        raise HTTPException(status_code=404, detail="Card template not found")
    return record.model_dump(by_alias=True)


@router.post("/card-templates")
async def create_card_template(payload: PlatformCardTemplateRecord, db: AsyncSession = Depends(get_db)):
    record = await upsert_card_template_record(db, payload)
    return record.model_dump(by_alias=True)


@router.put("/card-templates/{template_id}")
async def update_card_template(template_id: str, payload: PlatformCardTemplateRecord, db: AsyncSession = Depends(get_db)):
    data = payload.model_copy(update={"template_id": template_id})
    record = await upsert_card_template_record(db, data)
    return record.model_dump(by_alias=True)


@router.delete("/card-templates/{template_id}")
async def delete_card_template(template_id: str, db: AsyncSession = Depends(get_db)):
    deleted = await delete_card_template_record(db, template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Card template not found")
    return {"ok": True, "template_id": template_id}


@router.post("/cards/preview")
async def preview_card(payload: CardPreviewReq):
    return build_template_card(payload.template, payload.source_payload, payload.binding)


@router.get("/card-packs")
async def list_card_packs_api():
    return [item.model_dump() for item in list_card_pack_summaries()]


@router.get("/card-packs/template")
async def card_pack_template_api():
    return get_card_pack_template_payload()


@router.post("/card-packs/import")
async def import_card_pack_api(payload: dict[str, Any], db: AsyncSession = Depends(get_db)):
    result = await import_card_pack(db, payload)
    return result.model_dump()


@router.post("/card-packs/scan")
async def scan_card_packs_api(db: AsyncSession = Depends(get_db)):
    results = await scan_card_packs_directory(db)
    return [r.model_dump() for r in results]


@router.get("/card-packs/{pack_id}/export")
async def export_card_pack_api(pack_id: str):
    try:
        return export_card_pack_payload(pack_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Card pack not found: {pack_id}") from exc


@router.get("/skills")
async def platform_skills(include_disabled: bool = False):
    return [record.model_dump(by_alias=True) for record in list_skill_records(include_disabled=include_disabled, scoped=False)]


@router.post("/skills")
async def create_skill(payload: PlatformSkillRecord, db: AsyncSession = Depends(get_db)):
    record = await upsert_skill_record(db, payload)
    return record.model_dump(by_alias=True)


@router.put("/skills/{skill_name}")
async def update_skill(skill_name: str, payload: PlatformSkillRecord, db: AsyncSession = Depends(get_db)):
    data = payload.model_copy(update={"skill_name": skill_name})
    record = await upsert_skill_record(db, data)
    return record.model_dump(by_alias=True)


@router.delete("/skills/{skill_name}")
async def delete_skill(skill_name: str, db: AsyncSession = Depends(get_db)):
    deleted = await delete_skill_record(db, skill_name)
    if not deleted:
        raise HTTPException(status_code=404, detail="Skill not found")
    return {"ok": True, "skill_name": skill_name}


@router.post("/skills/generate/stream")
async def generate_skill_stream(payload: SkillGenerateReq, request: Request):
    skill_name = str(payload.skill_name or "").strip()
    if not skill_name:
        raise HTTPException(status_code=400, detail="请先填写技能名称")
    tool_names = [str(name or "").strip() for name in payload.tool_names if str(name or "").strip()]
    if not tool_names:
        raise HTTPException(status_code=400, detail="请先选择至少一个绑定工具")
    if not str(payload.model_vendor_id or "").strip() or not str(payload.model_id or "").strip():
        raise HTTPException(status_code=400, detail="请先选择生成 Skill 用的大模型")

    system_prompt = "\n".join([
        "你是 CSAgent 平台的 Skill 文档生成器。",
        "你的任务是基于技能名称、已有摘要/正文提示、以及已绑定工具，生成可直接保存到平台注册中心的 Skill 摘要和正文。",
        "请严格遵守以下要求：",
        "1. 只能输出以下结构，不要输出结构以外的解释、前后缀或代码块。",
        "2. 使用中文。",
        f"3. 输出格式必须是：{SKILL_SUMMARY_START}...{SKILL_SUMMARY_END}{SKILL_BODY_START}...{SKILL_BODY_END}",
        "4. SUMMARY 保持简洁，适合作为系统提示内的技能摘要，建议 40-120 字。",
        "5. BODY 必须是 Markdown，至少包含：# 技能目标、# 适用场景、# 可用工具、# 执行步骤、# 输出约束、# 注意事项。",
        "6. 只能引用输入中明确给出的工具名和工具能力，不得虚构工具。",
        "7. 如果输入里已有摘要或正文，请吸收其中有效意图，但输出更完整、结构化的新版本。",
    ])
    context, messages = _build_skill_generation_context(payload)

    async def gen():
        provider = create_provider({
            "vendor_id": str(payload.model_vendor_id or "").strip(),
            "model_id": str(payload.model_id or "").strip(),
        })
        yield _sse({
            "type": "meta",
            "vendor_id": provider.name,
            "model_id": provider.model,
            "skill_name": skill_name,
            "tool_count": len(tool_names),
        })
        assembled = ""
        streamed_summary = ""
        streamed_body = ""
        try:
            async for event in provider.stream(system=[system_prompt], messages=messages, tools=None, temperature=0.4):
                if await request.is_disconnected():
                    return
                if event.type == "text_delta":
                    assembled += event.content or ""
                    summary, body = _extract_skill_sections(assembled)
                    if summary.startswith(streamed_summary):
                        summary_delta = summary[len(streamed_summary):]
                    else:
                        summary_delta = summary
                    if body.startswith(streamed_body):
                        body_delta = body[len(streamed_body):]
                    else:
                        body_delta = body
                    if summary_delta:
                        streamed_summary = summary
                        yield _sse({"type": "summary_delta", "content": summary_delta, "summary": streamed_summary})
                    if body_delta:
                        streamed_body = body
                        yield _sse({"type": "document_delta", "content": body_delta, "document_md": streamed_body})
                    continue
                if event.type == "error":
                    yield _sse({"type": "error", "text": event.content or "Skill 生成失败"})
                    return
            final_summary, final_body = _finalize_skill_sections(assembled)
            if final_summary != streamed_summary:
                streamed_summary = final_summary
                yield _sse({"type": "summary_replace", "summary": streamed_summary})
            if final_body != streamed_body:
                streamed_body = final_body
                yield _sse({"type": "document_replace", "document_md": streamed_body})
            yield _sse({
                "type": "done",
                "summary": streamed_summary,
                "document_md": streamed_body,
                "context": context,
            })
        except Exception as exc:
            yield _sse({"type": "error", "text": str(exc)})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/agents")
async def platform_agents(include_disabled: bool = False):
    return [record.model_dump(by_alias=True) for record in list_agent_records(include_disabled=include_disabled)]


@router.get("/agents/{agent_id}")
async def platform_agent(agent_id: str):
    record = get_agent_record(agent_id)
    if not record:
        raise HTTPException(status_code=404, detail="Agent not found")
    return record.model_dump(by_alias=True)


@router.post("/agents")
async def create_agent(payload: PlatformAgentRecord, db: AsyncSession = Depends(get_db)):
    record = await upsert_agent_record(db, payload)
    return record.model_dump(by_alias=True)


@router.put("/agents/{agent_id}")
async def update_agent(agent_id: str, payload: PlatformAgentRecord, db: AsyncSession = Depends(get_db)):
    data = payload.model_copy(update={"agent_id": agent_id})
    record = await upsert_agent_record(db, data)
    return record.model_dump(by_alias=True)


@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    try:
        deleted = await delete_agent_record(db, agent_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"ok": True, "agent_id": agent_id}


@router.post("/agents/{agent_id}/publish")
async def platform_publish_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    record = await publish_agent(db, agent_id)
    if not record:
        raise HTTPException(status_code=404, detail="Agent not found")
    return record.model_dump(by_alias=True)
