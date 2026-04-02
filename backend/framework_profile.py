from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any
import re
import uuid

import yaml
from pydantic import BaseModel, Field

from config import BACKEND_DIR

PROFILE_FILE = BACKEND_DIR / "framework_profile.yaml"

DEFAULT_SYSTEM_CORE = """你是一个通用客服智能体框架中的 AI 助手。你的职责是：
1. 回答用户的常见问题，并在需要时调用工具获取准确结果
2. 基于 Agent、Skill、Tool 的平台配置推进当前任务
3. 在工具不足或信息不足时，明确说明限制并继续引导用户
4. 在多轮对话中保持上下文连续性，尽量减少重复确认

工作原则：
- 保持专业、礼貌、简洁
- 优先使用工具和结构化结果，不要编造事实
- 每次最多推进一个明确动作，必要时先确认再执行
- 如果当前工具或技能不足，优先加载合适的技能或说明当前能力边界
- 如果当前问题与已保存的长期记忆相关，可以结合这些记忆提高回复质量，但不要机械复述记忆内容"""

DEFAULT_SKILL_GUIDE = """## 技能系统

你拥有一个按场景组织的技能系统。技能（Skill）代表一组专属工具和操作指南，而不是知识分类本身。

系统提示中已经包含当前 Agent 可用技能的摘要。

### 全局工具
- **load_skills**: 当某个技能摘要不足以支撑执行时，按技能名加载该技能的完整正文。
- **list_tools**: 查看当前 Agent 在本轮上下文中可用的工具。

### 通用工作方式
1. 先判断当前问题是否可以直接回答
2. 优先直接依据系统提示里的技能摘要选择合适能力，不需要先额外列技能
3. 只有当摘要不足时，再调用 `load_skills(skill_name="技能名")` 查看完整技能正文
4. 技能加载后，再调用该技能对应的专属工具
5. 工具返回卡片时，在回复中用 `[[CARD:card_id]]` 引用对应卡片
6. 对于存在副作用的操作，优先等待明确确认再继续"""

DEFAULT_COMPACTION_PROMPT = """你将为一个通用客服智能体生成对话压缩摘要，用于替代冗长历史。
请只输出 continuity summary，重点包含：
1. 用户当前核心诉求、偏好和限制条件
2. 已完成的关键步骤和重要结论
3. 当前仍待处理的问题
4. 最合理的下一步
5. 不要重复抄写外层已保留的结构化运行信息和最近工具结果

要求：中文、简洁、可延续下一轮处理。"""

DEFAULT_LONG_TERM_MEMORY_PROMPT = """以下内容是长期记忆，代表跨会话保留的稳定偏好、约束或常用规则。
仅在它们与当前请求直接相关时使用；不要逐条复述，也不要让长期记忆覆盖当前用户刚刚表达的新需求。"""


class MemoryItem(BaseModel):
    id: str = ""
    title: str = ""
    content: str = ""
    tags: list[str] = Field(default_factory=list)
    enabled: bool = True


class PromptSettings(BaseModel):
    system_core: str = DEFAULT_SYSTEM_CORE
    skill_guide: str = DEFAULT_SKILL_GUIDE
    compaction: str = DEFAULT_COMPACTION_PROMPT


class LongTermMemorySettings(BaseModel):
    enabled: bool = True
    top_k: int = 4
    prompt: str = DEFAULT_LONG_TERM_MEMORY_PROMPT
    items: list[MemoryItem] = Field(default_factory=list)


class UiSettings(BaseModel):
    app_name: str = "CSAgent Platform"
    app_subtitle: str = "平台控制台"
    welcome_title: str = "平台控制台"
    welcome_description: str = "管理模型、智能体、工具、技能、卡片与会话。"
    identity_label: str = "演示身份"
    identity_hint: str = "可选；选择后会把该身份标识作为演示环境中的默认用户标识。"
    selected_identity_prefix: str = "当前演示身份"
    quick_actions: list[str] = Field(
        default_factory=lambda: [
            "介绍一下这个平台能做什么",
            "查看当前可用工具",
            "查看当前可用技能",
            "帮我规划一个新的 Agent",
        ]
    )
    highlights: list[str] = Field(
        default_factory=lambda: [
            "工具注册中心",
            "技能与 Agent 配置",
            "MCP 工具接入",
        ]
    )


class FrameworkProfile(BaseModel):
    prompts: PromptSettings = Field(default_factory=PromptSettings)
    long_term_memory: LongTermMemorySettings = Field(default_factory=LongTermMemorySettings)
    ui: UiSettings = Field(default_factory=UiSettings)


DEFAULT_PROFILE = FrameworkProfile(
    long_term_memory=LongTermMemorySettings(
        items=[
            MemoryItem(
                id="mem_framework_goal",
                title="框架方向",
                content="优先保持通用化、平台化与注册中心治理，减少行业或品牌绑定，示例尽量使用问答、查询、推荐、下单等通用场景。",
                tags=["framework", "generic", "platform_registry"],
                enabled=True,
            )
        ]
    )
)


def _read_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    return raw if isinstance(raw, dict) else {}


def _write_yaml(path: Path, data: dict[str, Any]) -> None:
    path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")


def _deep_merge(target: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    for key, value in (patch or {}).items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            _deep_merge(target[key], value)
        else:
            target[key] = deepcopy(value)
    return target


def _ensure_profile_file() -> None:
    if PROFILE_FILE.exists():
        return
    save_framework_profile(DEFAULT_PROFILE)


def _normalize_profile(profile: FrameworkProfile) -> FrameworkProfile:
    payload = profile.model_dump()
    items: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for raw in payload.get("long_term_memory", {}).get("items", []) or []:
        item = MemoryItem.model_validate(raw)
        item.title = str(item.title or "").strip()
        item.content = str(item.content or "").strip()
        item.tags = [str(tag or "").strip() for tag in item.tags if str(tag or "").strip()]
        if not item.content:
            continue
        if not item.id or item.id in seen_ids:
            item.id = f"mem_{uuid.uuid4().hex[:12]}"
        seen_ids.add(item.id)
        if not item.title:
            item.title = item.content[:24]
        items.append(item.model_dump())
    payload["long_term_memory"]["items"] = items

    prompts = payload.get("prompts", {})
    skill_guide = str(prompts.get("skill_guide") or "")
    if not skill_guide.strip() or "list_skills" in skill_guide:
        prompts["skill_guide"] = DEFAULT_SKILL_GUIDE

    default_ui = UiSettings().model_dump()
    ui = payload.get("ui", {})
    if not str(ui.get("app_name") or "").strip() or "Studio" in str(ui.get("app_name") or ""):
        ui["app_name"] = default_ui["app_name"]
    if not str(ui.get("app_subtitle") or "").strip() or str(ui.get("app_subtitle") or "") == "通用客服智能体框架":
        ui["app_subtitle"] = default_ui["app_subtitle"]
    if not str(ui.get("welcome_title") or "").strip() or str(ui.get("welcome_title") or "") == "你好，我是通用客服智能体":
        ui["welcome_title"] = default_ui["welcome_title"]
    if not str(ui.get("welcome_description") or "").strip() or "Agent、技能、工具与卡片输出协议" in str(ui.get("welcome_description") or ""):
        ui["welcome_description"] = default_ui["welcome_description"]

    return FrameworkProfile.model_validate(payload)


def load_framework_profile() -> FrameworkProfile:
    _ensure_profile_file()
    data = _read_yaml(PROFILE_FILE)
    merged = DEFAULT_PROFILE.model_dump()
    _deep_merge(merged, data)
    normalized = _normalize_profile(FrameworkProfile.model_validate(merged))
    normalized_payload = normalized.model_dump()
    if normalized_payload != data:
        _write_yaml(PROFILE_FILE, normalized_payload)
    return normalized


def save_framework_profile(profile: FrameworkProfile) -> FrameworkProfile:
    normalized = _normalize_profile(profile)
    _write_yaml(PROFILE_FILE, normalized.model_dump())
    return normalized


def patch_framework_profile(patch: dict[str, Any] | None = None) -> FrameworkProfile:
    current = load_framework_profile().model_dump()
    _deep_merge(current, patch or {})
    return save_framework_profile(FrameworkProfile.model_validate(current))


def select_long_term_memories(query: str = "", limit: int = 0) -> list[MemoryItem]:
    profile = load_framework_profile()
    memory = profile.long_term_memory
    if not memory.enabled:
        return []

    items = [item for item in memory.items if item.enabled and str(item.content or "").strip()]
    if not items:
        return []

    query_tokens = _tokenize(query)
    scored: list[tuple[int, int, MemoryItem]] = []
    for idx, item in enumerate(items):
        haystack = " ".join([item.title, item.content, " ".join(item.tags)]).lower()
        score = 0
        if query_tokens:
            for token in query_tokens:
                if token in haystack:
                    score += 2 if token in item.title.lower() else 1
        scored.append((score, -idx, item))

    scored.sort(key=lambda row: (row[0], row[1]), reverse=True)
    top_k = int(limit or memory.top_k or 0)
    if top_k <= 0:
        top_k = len(scored)
    picked = [item for score, _idx, item in scored if score > 0][:top_k]
    if picked:
        return picked
    return [item for _score, _idx, item in scored[:top_k]]


def render_long_term_memory(query: str = "", limit: int = 0, prompt_override: str = "") -> str:
    profile = load_framework_profile()
    memory = profile.long_term_memory
    if not memory.enabled:
        return ""
    items = select_long_term_memories(query=query, limit=limit)
    if not items:
        return ""
    prompt_text = str(prompt_override or memory.prompt).strip()
    lines = [prompt_text, "", "### 已命中的长期记忆"]
    for item in items:
        lines.append(f"- {item.title}: {item.content}")
    return "\n".join(line for line in lines if line)


def _tokenize(text: str) -> set[str]:
    lowered = str(text or "").lower()
    chunks = re.findall(r"[\w\-\u4e00-\u9fff]{2,}", lowered)
    return {chunk.strip() for chunk in chunks if chunk.strip()}
