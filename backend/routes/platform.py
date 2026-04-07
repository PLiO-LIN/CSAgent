from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from card.runtime import build_template_card
from db.engine import get_db
from platform_registry import (
    PlatformAgentRecord,
    PlatformCardTemplateRecord,
    PlatformSkillRecord,
    PlatformToolRecord,
    delete_agent_record,
    delete_card_template_record,
    delete_skill_record,
    delete_tool_record,
    get_agent_record,
    get_card_template_record,
    get_registry_snapshot,
    list_agent_records,
    list_card_template_records,
    list_skill_records,
    list_tool_records,
    publish_agent,
    sync_local_tools_into_registry,
    sync_mcp_tools_into_registry,
    upsert_agent_record,
    upsert_card_template_record,
    upsert_skill_record,
    upsert_tool_record,
)

router = APIRouter(prefix="/api/platform", tags=["platform"])


class CardPreviewReq(BaseModel):
    template: PlatformCardTemplateRecord
    source_payload: dict[str, Any] = Field(default_factory=dict)
    binding: dict[str, Any] = Field(default_factory=dict)


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
