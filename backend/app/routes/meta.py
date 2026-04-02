from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings
from app.plugins.manifest import discover_plugins, discover_skills
from framework_profile import load_framework_profile, patch_framework_profile

router = APIRouter(prefix="/api/framework", tags=["framework"])


class FrameworkProfilePatchReq(BaseModel):
    prompts: dict[str, Any] | None = None
    long_term_memory: dict[str, Any] | None = None
    ui: dict[str, Any] | None = None


@router.get("/info")
async def framework_info():
    plugins = discover_plugins()
    skills = discover_skills()
    return {
        "name": settings.app.name,
        "version": settings.app.version,
        "mode": settings.app.mode,
        "legacy_bridge": {
            "enabled": settings.legacy_bridge.enabled,
            "base_url": settings.legacy_bridge.base_url,
        },
        "plugins": [
            {
                "plugin_id": plugin.plugin_id,
                "name": plugin.name,
                "version": plugin.version,
                "kind": plugin.kind,
                "summary": plugin.summary,
                "exports": plugin.exports.model_dump(),
            }
            for plugin in plugins
        ],
        "skills": [
            {
                "plugin_id": skill.plugin_id,
                "name": skill.name,
                "description": skill.description,
                "tools": skill.tools,
                "card_types": skill.card_types,
            }
            for skill in skills
        ],
    }


@router.get("/profile")
async def get_framework_profile():
    return load_framework_profile().model_dump()


@router.put("/profile")
async def update_framework_profile(req: FrameworkProfilePatchReq):
    profile = patch_framework_profile(req.model_dump(exclude_none=True))
    return profile.model_dump()
