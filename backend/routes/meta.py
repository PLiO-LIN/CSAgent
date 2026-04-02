from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.engine import get_db
from framework_profile import load_framework_profile, patch_framework_profile
from platform_registry import get_registry_snapshot

router = APIRouter(prefix="/api/framework", tags=["framework"])


class FrameworkProfilePatchReq(BaseModel):
    prompts: dict[str, Any] | None = None
    long_term_memory: dict[str, Any] | None = None
    ui: dict[str, Any] | None = None


@router.get("/info")
async def framework_info(db: AsyncSession = Depends(get_db)):
    snapshot = await get_registry_snapshot(db)
    return {
        "name": "CSAgent",
        "version": "0.2.0",
        "mode": "native_core",
        "mcp_enabled": settings.mcp_enabled,
        "tools": snapshot.get("tools", []),
        "skills": snapshot.get("skills", []),
        "agents": snapshot.get("agents", []),
    }


@router.get("/profile")
async def get_framework_profile():
    return load_framework_profile().model_dump()


@router.put("/profile")
async def update_framework_profile(req: FrameworkProfilePatchReq):
    profile = patch_framework_profile(req.model_dump(exclude_none=True))
    return profile.model_dump()
