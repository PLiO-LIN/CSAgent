from __future__ import annotations

from fastapi import APIRouter

from app.config import settings
from app.plugins.manifest import discover_plugins, discover_skills

router = APIRouter(prefix="/api/framework", tags=["framework"])


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
