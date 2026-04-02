"""
Skill 规约系统（v3）：从平台注册表加载技能定义。

当前主来源：平台注册中心中的 Skill 文档与元数据。

工具分为两类：
- 全局工具（scope="global"）：始终可用，如 load_skills
- 技能工具（scope="skill"）：仅当对应技能被加载后才可用
"""
import logging
from dataclasses import dataclass, field

from platform_registry import get_skill_record, has_registry_skills, list_skill_records
from provider.base import ToolDef
from tool.base import get_tool, ToolEntry

logger = logging.getLogger(__name__)


@dataclass
class Skill:
    name: str
    description: str
    tools: list[str] = field(default_factory=list)
    plugin_id: str = ""
    card_types: list[str] = field(default_factory=list)
    global_tools: list[str] = field(default_factory=list)
    entry_intents: list[str] = field(default_factory=list)
    phases: list[str] = field(default_factory=list)
    prompt: str = ""

    def available_tools(self) -> list[ToolDef]:
        """返回该技能声明的工具定义列表"""
        result = []
        for name in self.tools:
            entry = get_tool(name)
            if entry:
                result.append(entry.to_def())
        return result

    def get_entries(self) -> list[ToolEntry]:
        result = []
        for name in self.tools:
            entry = get_tool(name)
            if entry:
                result.append(entry)
        return result

    def summary_text(self, active: bool = False) -> str:
        tool_names = ", ".join(self.tools) if self.tools else "无专属工具"
        status = "已激活" if active else "可按需加载"
        return (
            f"- `{self.name}`（{status}）: {self.description or '无描述'}；"
            f"工具: {tool_names}；"
            f"需要完整说明时调用 `load_skills(skill_name=\"{self.name}\")`。"
        )


# ─── 技能加载 ───

_skill_cache: dict[str, Skill] = {}


def _load_all_skills() -> dict[str, Skill]:
    """按平台注册表加载技能定义。"""
    if not has_registry_skills():
        _skill_cache.clear()
        setattr(_load_all_skills, "_signature", ())
        return _skill_cache

    records = list_skill_records(include_disabled=False, scoped=True)
    signature = tuple(sorted(f"{item.skill_name}:{item.updated_at}" for item in records))
    if _skill_cache and getattr(_load_all_skills, "_signature", ()) == signature:
        return _skill_cache

    _skill_cache.clear()
    for record in records:
        skill = Skill(
            name=record.skill_name,
            description=record.summary,
            tools=record.tool_names,
            plugin_id=str((record.metadata or {}).get("plugin_id", record.source_type) or record.source_type),
            card_types=record.card_types,
            global_tools=record.global_tool_names,
            entry_intents=record.entry_intents,
            phases=record.phases,
            prompt=record.document_md,
        )
        _skill_cache[skill.name] = skill
    setattr(_load_all_skills, "_signature", signature)
    return _skill_cache


def list_skills() -> list[Skill]:
    """返回所有可用技能"""
    return list(_load_all_skills().values())


def get_skill(name: str) -> Skill | None:
    """按名称获取技能"""
    target = str(name or "").strip()
    record = get_skill_record(target)
    if not record:
        return None
    return Skill(
        name=record.skill_name,
        description=record.summary,
        tools=record.tool_names,
        plugin_id=str((record.metadata or {}).get("plugin_id", record.source_type) or record.source_type),
        card_types=record.card_types,
        global_tools=record.global_tool_names,
        entry_intents=record.entry_intents,
        phases=record.phases,
        prompt=record.document_md,
    )


def render_skill_catalog(active_skill_names: list[str] | None = None) -> str:
    skills = list_skills()
    if not skills:
        return ""
    active_names = {str(name or "").strip() for name in (active_skill_names or []) if str(name or "").strip()}
    lines = ["可用技能摘要：", ""]
    for skill in skills:
        lines.append(skill.summary_text(active=skill.name in active_names))
    return "\n".join(lines)


def resolve(name: str | None = None) -> Skill:
    """兼容旧接口：按名称解析技能，找不到返回 None 而不是默认"""
    if not name:
        return Skill(name="default", description="默认（无技能加载）")
    skill = get_skill(name)
    return skill if skill else Skill(name="default", description="默认（无技能加载）")


def reload_skills() -> None:
    """清除缓存，重新加载所有技能"""
    _skill_cache.clear()
    _load_all_skills()
