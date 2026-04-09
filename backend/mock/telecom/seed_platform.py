"""
电信客服模拟场景 — 平台种子脚本
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
将模拟 MCP 工具、卡片模板、技能、智能体注册到平台 DB。

用法:
  cd backend
  python -m mock.telecom.seed_platform          # 默认 seed
  python -m mock.telecom.seed_platform --clean   # 清除本脚本写入的种子数据

前置条件:
  1. 后端 DB 已初始化 (backend/csagent.db 存在)
  2. mock MCP 服务器已启动或即将启动在 127.0.0.1:9100

脚本会自动注册:
  - 9 个 MCP 工具 (query_customer_info, query_balance, …, search_knowledge)
  - 5 个卡片模板 (客户信息、余额、用量、账单、推荐)
  - 3 个技能 (telecom_query, telecom_recommend, telecom_order)
  - 1 个智能体 (telecom_agent)
  - 1 个 MCP 服务器配置 (telecom-mock SSE)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import time

# 确保 backend 在 sys.path 中
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from db.engine import Session, init_db
from platform_registry import (
    PlatformAgentRecord,
    PlatformCardTemplateRecord,
    PlatformSkillRecord,
    PlatformToolRecord,
    refresh_registry_cache,
    upsert_agent_record,
    upsert_card_template_record,
    upsert_skill_record,
    upsert_tool_record,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger("telecom_seed")

MCP_SERVER_NAME = "telecom-mock"
MCP_SERVER_URL = "http://127.0.0.1:9100/sse"
SEED_TAG = "telecom_mock_seed"
# MCP runtime 会将工具名重命名为 mcp__<server>__<tool> 格式
MCP_TOOL_PREFIX = "mcp__telecom-mock__"

# ── 卡片模板 ─────────────────────────────────────────────

CARD_TEMPLATES = [
    PlatformCardTemplateRecord(
        template_id="telecom_customer_info",
        display_name="客户信息卡",
        summary="展示电信客户基本资料：姓名、账户、地址、设备列表等",
        template_type="info_detail",
        renderer_key="template::info_detail",
        ui_schema={
            "blocks": [
                {"type": "hero", "title": "$.title", "summary": "$.summary"},
                {"type": "kv_list", "path": "$.fields"},
            ],
        },
        sample_payload={
            "title": "客户信息",
            "summary": "谭志松 - 19921199563",
            "fields": [
                {"label": "姓名", "value": "谭志松"},
                {"label": "手机号", "value": "19921199563"},
                {"label": "账户编号", "value": "23017525004"},
                {"label": "付费方式", "value": "后付费"},
                {"label": "状态", "value": "在用"},
            ],
        },
        metadata={"managed_by": SEED_TAG},
    ),
    PlatformCardTemplateRecord(
        template_id="telecom_balance",
        display_name="余额卡",
        summary="展示话费余额概览：总余额、专用/通用余额、欠费",
        template_type="metric_summary",
        renderer_key="template::metric_summary",
        ui_schema={
            "blocks": [
                {"type": "hero", "title": "$.title", "summary": "$.summary"},
                {"type": "metric_grid", "path": "$.metrics"},
            ],
        },
        sample_payload={
            "title": "话费余额",
            "summary": "余额充足，无欠费",
            "metrics": [
                {"label": "总余额", "value": "¥801.98", "hint": "专用+通用"},
                {"label": "专用余额", "value": "¥442.00"},
                {"label": "通用余额", "value": "¥359.98"},
                {"label": "欠费", "value": "¥0.00"},
            ],
        },
        metadata={"managed_by": SEED_TAG},
    ),
    PlatformCardTemplateRecord(
        template_id="telecom_package_usage",
        display_name="套餐用量卡",
        summary="展示流量、语音、短信套餐用量汇总",
        template_type="info_detail",
        renderer_key="template::info_detail",
        ui_schema={
            "blocks": [
                {"type": "hero", "title": "$.title", "summary": "$.summary"},
                {"type": "kv_list", "path": "$.fields"},
            ],
        },
        sample_payload={
            "title": "套餐用量 - 202603",
            "summary": "流量已用 23%，语音和短信用量极少",
            "fields": [
                {"label": "国内流量", "value": "122.55 / 523.48 GB (23%)"},
                {"label": "通用语音", "value": "0 / 100 分钟"},
                {"label": "专用语音", "value": "1 / 2437 分钟"},
                {"label": "短信", "value": "0 / 20 条"},
            ],
        },
        metadata={"managed_by": SEED_TAG},
    ),
    PlatformCardTemplateRecord(
        template_id="telecom_bill",
        display_name="账单卡",
        summary="展示月度账单金额和支付状态",
        template_type="metric_summary",
        renderer_key="template::metric_summary",
        ui_schema={
            "blocks": [
                {"type": "hero", "title": "$.title", "summary": "$.summary"},
                {"type": "metric_grid", "path": "$.metrics"},
            ],
        },
        sample_payload={
            "title": "账单 - 2026-02",
            "summary": "已支付，无欠费",
            "metrics": [
                {"label": "账单金额", "value": "¥29.00"},
                {"label": "已支付", "value": "¥29.00"},
                {"label": "欠费", "value": "¥0.00"},
                {"label": "状态", "value": "已支付"},
            ],
        },
        metadata={"managed_by": SEED_TAG},
    ),
    PlatformCardTemplateRecord(
        template_id="telecom_recommend",
        display_name="套餐推荐卡",
        summary="展示推荐套餐列表",
        template_type="recommendation_list",
        renderer_key="template::recommendation_list",
        ui_schema={
            "blocks": [
                {"type": "hero", "title": "$.title", "summary": "$.summary"},
                {"type": "item_list", "path": "$.items"},
            ],
        },
        action_schema={"actions": []},
        sample_payload={
            "title": "套餐推荐",
            "summary": "为您推荐 3 款套餐",
            "items": [
                {
                    "title": "5G畅享129元套餐",
                    "offer_id": "PKG_5G_129",
                    "summary": "30GB流量 + 500分钟通话",
                    "badges": ["129元/月"],
                    "actions": [{"label": "订购此套餐", "contentTemplate": "帮我订购 {{title}}，产品ID 是 {{offer_id}}", "displayTemplate": "订购 {{title}}"}],
                },
                {
                    "title": "云宽带美好家299元套餐",
                    "offer_id": "PKG_FAMILY_299",
                    "summary": "150GB流量 + 1500分钟 + 1000M宽带",
                    "badges": ["299元/月", "家庭"],
                    "actions": [{"label": "订购此套餐", "contentTemplate": "帮我订购 {{title}}，产品ID 是 {{offer_id}}", "displayTemplate": "订购 {{title}}"}],
                },
            ],
        },
        metadata={"managed_by": SEED_TAG},
    ),
]

# ── 工具 ─────────────────────────────────────────────────

def _mcp_tool(tool_name: str, display_name: str, summary: str,
              scope: str = "skill", supports_card: bool = False,
              card_type: str = "", card_binding: dict | None = None) -> PlatformToolRecord:
    return PlatformToolRecord(
        tool_name=f"{MCP_TOOL_PREFIX}{tool_name}",
        display_name=display_name,
        summary=summary,
        provider_type="mcp",
        source_ref=f"mcp:{MCP_SERVER_NAME}",
        scope=scope,
        enabled=True,
        supports_card=supports_card,
        card_type=card_type,
        card_binding=card_binding or {},
        input_schema={},
        output_schema={},
        transport_config={"mcp_server": MCP_SERVER_NAME},
        metadata={"managed_by": SEED_TAG},
    )


TOOLS = [
    _mcp_tool(
        "query_customer_info", "客户信息查询",
        "查询客户基本信息（姓名、账户、地址、设备列表等）",
        supports_card=True, card_type="telecom_customer_info",
        card_binding={"mode": "template_id", "template_id": "telecom_customer_info",
                      "field_map": {
                          "title": "'客户信息'",
                          "summary": "$._summary",
                          "fields": [
                              {"label": "姓名", "value": "$.custName"},
                              {"label": "手机号", "value": "$.phone"},
                              {"label": "客户编号", "value": "$.custNumber"},
                              {"label": "账户编号", "value": "$.acctCd"},
                              {"label": "付费方式", "value": "$.billingType"},
                              {"label": "状态", "value": "$.statusCd"},
                              {"label": "产品类型", "value": "$.prodName"},
                              {"label": "联系地址", "value": "$.contactAddr"},
                              {"label": "邮箱", "value": "$.email"},
                          ],
                      }},
    ),
    _mcp_tool(
        "query_balance", "余额查询",
        "查询话费余额（总余额、专用/通用余额、欠费等）",
        supports_card=True, card_type="telecom_balance",
        card_binding={"mode": "template_id", "template_id": "telecom_balance",
                      "field_map": {
                          "title": "'话费余额'",
                          "summary": "$._summary",
                          "metrics": [
                              {"label": "总余额", "value": "$.show_ye", "hint": "单位：分"},
                              {"label": "专用余额", "value": "$.show_ye_zy"},
                              {"label": "通用余额", "value": "$.show_ye_ty"},
                              {"label": "欠费", "value": "$.shouldCharge"},
                          ],
                      }},
    ),
    _mcp_tool(
        "query_package_usage", "套餐用量查询",
        "查询套餐用量（流量、语音、短信用量汇总）",
        supports_card=True, card_type="telecom_package_usage",
        card_binding={"mode": "template_id", "template_id": "telecom_package_usage",
                      "field_map": {
                          "title": "'套餐用量'",
                          "summary": "$._summary",
                      }},
    ),
    _mcp_tool(
        "query_bill", "账单查询",
        "查询月度账单（金额、支付状态等）",
        supports_card=True, card_type="telecom_bill",
        card_binding={"mode": "template_id", "template_id": "telecom_bill",
                      "field_map": {
                          "title": "'月度账单'",
                          "summary": "$._summary",
                      }},
    ),
    _mcp_tool(
        "query_points", "积分查询",
        "查询积分信息（总积分、可用、已用、即将清零等）",
        supports_card=True, card_type="telecom_balance",
        card_binding={"mode": "template_id", "template_id": "telecom_balance",
                      "field_map": {
                          "title": "'积分信息'",
                          "summary": "$._summary",
                          "metrics": [
                              {"label": "可用积分", "value": "$.useablePoints"},
                              {"label": "总积分", "value": "$.sumPoints"},
                              {"label": "已用积分", "value": "$.usedPoints"},
                              {"label": "本月新增", "value": "$.currMonthPoints"},
                          ],
                      }},
    ),
    _mcp_tool(
        "query_subscriptions", "订购关系查询",
        "查询当前在用的所有套餐和可选包（名称、状态、生效/失效时间）",
    ),
    _mcp_tool(
        "recommend_packages_tool", "套餐推荐",
        "根据需求推荐合适的套餐（支持流量/语音/家庭/低价方向）",
        supports_card=True, card_type="telecom_recommend",
        card_binding={"mode": "template_id", "template_id": "telecom_recommend",
                      "field_map": {
                          "title": "'套餐推荐'",
                          "summary": "$._summary",
                      }},
    ),
    _mcp_tool(
        "submit_order", "订购下单",
        "订购指定套餐/产品（需提供手机号、产品ID、产品名称）",
    ),
    _mcp_tool(
        "search_knowledge", "知识库搜索",
        "在电信业务知识库中搜索相关问答（支持套餐、宽带、发票、积分等）",
        scope="global",
    ),
]

# ── 技能 ─────────────────────────────────────────────────

SKILLS = [
    PlatformSkillRecord(
        skill_name="telecom_query",
        display_name="电信查询",
        summary="客户信息、余额、用量、账单、积分、订购关系查询",
        tool_names=[
            f"{MCP_TOOL_PREFIX}query_customer_info",
            f"{MCP_TOOL_PREFIX}query_balance",
            f"{MCP_TOOL_PREFIX}query_package_usage",
            f"{MCP_TOOL_PREFIX}query_bill",
            f"{MCP_TOOL_PREFIX}query_points",
            f"{MCP_TOOL_PREFIX}query_subscriptions",
        ],
        card_types=[
            "telecom_customer_info",
            "telecom_balance",
            "telecom_package_usage",
            "telecom_bill",
        ],
        entry_intents=["查询", "余额", "用量", "账单", "积分", "套餐", "客户信息", "订购关系"],
        document_md="""\
# 电信查询技能

## 能力
- 客户基本信息查询：姓名、账户、地址、关联设备
- 话费余额查询：总余额、专用/通用余额、欠费
- 套餐用量查询：流量、语音、短信月度用量
- 账单查询：月度消费金额、支付状态
- 积分查询：可用积分、已用积分、即将清零
- 订购关系查询：在用套餐、可选包、状态

## 约束
- 查询操作需要用户提供手机号
- 用量查询可指定月份（YYYYMM），默认当月
- 账单查询可指定月份范围（YYYY-MM），默认上月
- 所有金额单位为"分"，展示时需转换为"元"（÷100）
""",
        metadata={"managed_by": SEED_TAG},
    ),
    PlatformSkillRecord(
        skill_name="telecom_recommend",
        display_name="套餐推荐",
        summary="根据用户需求推荐合适的套餐方案",
        tool_names=[f"{MCP_TOOL_PREFIX}recommend_packages_tool"],
        card_types=["telecom_recommend"],
        entry_intents=["推荐", "办套餐", "换套餐", "升级", "降档", "流量不够", "通话不够"],
        document_md="""\
# 套餐推荐技能

## 能力
- 根据用户需求推荐套餐：流量型、语音型、家庭融合型、低价型
- 展示套餐详情：月费、流量、语音、短信、宽带、增值权益

## 约束
- 推荐前应先了解用户当前套餐和用量情况（可调用查询工具）
- need_type 参数可选：流量、语音、家庭、低价、全部
- 推荐后应询问用户是否需要订购
""",
        metadata={"managed_by": SEED_TAG},
    ),
    PlatformSkillRecord(
        skill_name="telecom_order",
        display_name="业务订购",
        summary="帮助用户订购套餐和产品",
        tool_names=[f"{MCP_TOOL_PREFIX}submit_order"],
        entry_intents=["订购", "开通", "办理", "下单"],
        document_md="""\
# 业务订购技能

## 能力
- 订购指定套餐或可选包

## 约束
- 下单前必须与用户确认：手机号、产品名称、产品ID
- 下单需要提供 phone, offer_id, offer_name 三个参数
- 下单后展示订单号和状态
- 不可在用户未确认的情况下自动下单
""",
        metadata={"managed_by": SEED_TAG},
    ),
]

# ── 智能体 ────────────────────────────────────────────────

AGENT = PlatformAgentRecord(
    agent_id="telecom_agent",
    name="电信客服智能体",
    description="模拟电信客服场景：支持知识问答、查询、推荐、下单",
    enabled=True,
    published=True,
    is_default=False,
    persona_prompt="""\
你是一名专业的中国电信客服代表，为用户提供热情、耐心、准确的服务。

## 服务原则
- 始终使用礼貌用语，称呼用户为"您"
- 先理解用户诉求，再调用合适的工具
- 查询类操作需要用户提供手机号
- 涉及金额时注意单位转换（系统返回"分"，展示为"元"）
- 推荐套餐前应了解用户当前情况和需求
- 下单前务必与用户确认产品信息

## 知识问答
- 对于业务政策、规则类问题，优先使用 search_knowledge 工具搜索知识库
- 搜索结果如有相关答案，基于答案回复用户
- 如果知识库无匹配，坦诚告知并建议联系人工客服

## 服务范围
- 客户信息、余额、用量、账单、积分查询
- 套餐推荐与对比
- 套餐订购
- 知识库问答（套餐政策、宽带业务、发票、积分兑换等）
""",
    global_tool_names=["load_skills", f"{MCP_TOOL_PREFIX}search_knowledge"],
    skill_names=["telecom_query", "telecom_recommend", "telecom_order"],
    metadata={"managed_by": SEED_TAG},
)

# ── MCP 服务器配置 ────────────────────────────────────────

MCP_SERVER_CONFIG = {
    "enabled": True,
    "transport": "sse",
    "url": MCP_SERVER_URL,
    "scope": "global",
    "tool_name_prefix": "mcp__{server}__",
    "timeout_seconds": 30.0,
    "tool_timeout_seconds": 60.0,
    "risk_level": "low",
    "confirm_policy": "never",
}


# ── 执行 ─────────────────────────────────────────────────

async def seed():
    """注册所有种子数据到平台 DB。"""
    await init_db()
    async with Session() as db:
        await refresh_registry_cache(db)

        logger.info("=== 注册卡片模板 ===")
        for tpl in CARD_TEMPLATES:
            r = await upsert_card_template_record(db, tpl)
            logger.info("  ✓ %s (%s)", r.template_id, r.display_name)

        logger.info("=== MCP 工具接入说明 ===")
        logger.info("  ✓ 将由后端通过 /api/platform/tools/sync/mcp 自动同步 %d 个工具", len(TOOLS))

        logger.info("=== 注册技能 ===")
        for skill in SKILLS:
            r = await upsert_skill_record(db, skill)
            logger.info("  ✓ %s (%s) tools=%s", r.skill_name, r.display_name, r.tool_names)

        logger.info("=== 注册智能体 ===")
        r = await upsert_agent_record(db, AGENT)
        logger.info("  ✓ %s (%s)", r.agent_id, r.name)

        logger.info("=== 配置 MCP 服务器 ===")
        _patch_mcp_config()

        logger.info("")
        logger.info("🎉 种子数据注册完成！")
        logger.info("   卡片模板: %d", len(CARD_TEMPLATES))
        logger.info("   MCP工具:  %d (等待后端 sync)", len(TOOLS))
        logger.info("   技能:     %d", len(SKILLS))
        logger.info("   智能体:   telecom_agent")
        logger.info("")
        logger.info("下一步:")
        logger.info("  1. 启动 MCP 服务器: python -m mock.telecom.server")
        logger.info("  2. 启动后端:        python main.py")
        logger.info("  3. 同步 MCP 工具:    POST /api/platform/tools/sync/mcp")
        logger.info("  4. 在平台控制台选择 telecom_agent 开始对话")


def _patch_mcp_config():
    """将模拟 MCP 服务器配置写入 config.yaml。"""
    try:
        import yaml
        config_path = os.path.join(_BACKEND_DIR, "config.yaml")
        if not os.path.exists(config_path):
            logger.warning("  config.yaml 不存在，跳过 MCP 配置")
            return
        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        mcp_block = config.get("mcp") or {}
        if not isinstance(mcp_block, dict):
            mcp_block = {}
        servers = mcp_block.get("servers") or {}
        if not isinstance(servers, dict):
            servers = {}
        existed = MCP_SERVER_NAME in servers
        servers[MCP_SERVER_NAME] = dict(MCP_SERVER_CONFIG)
        mcp_block["enabled"] = True
        mcp_block["servers"] = servers
        config["mcp"] = mcp_block
        if existed:
            logger.info("  ✓ 更新已有 MCP 服务器配置: %s", MCP_SERVER_NAME)
        else:
            logger.info("  ✓ 新增 MCP 服务器配置: %s → %s", MCP_SERVER_NAME, MCP_SERVER_URL)
        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(config, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
    except Exception as e:
        logger.warning("  MCP 配置写入失败: %s", e)
        logger.info("  请手动在 config.yaml 的 mcp.servers 中添加:")
        logger.info("    %s:", MCP_SERVER_NAME)
        logger.info("      transport: sse")
        logger.info("      url: %s", MCP_SERVER_URL)
        logger.info("      enabled: true")


async def clean():
    """清除本脚本写入的种子数据。"""
    from sqlalchemy import delete
    from db.models import (
        PlatformAgentModel,
        PlatformCardTemplateModel,
        PlatformSkillModel,
        PlatformToolModel,
    )

    await init_db()
    async with Session() as db:
        # 删除 agent
        await db.execute(delete(PlatformAgentModel).where(PlatformAgentModel.agent_id == AGENT.agent_id))
        logger.info("  ✓ 删除智能体: %s", AGENT.agent_id)

        # 删除 skills
        for skill in SKILLS:
            await db.execute(delete(PlatformSkillModel).where(PlatformSkillModel.skill_name == skill.skill_name))
            logger.info("  ✓ 删除技能: %s", skill.skill_name)

        # 删除 tools
        for tool in TOOLS:
            await db.execute(delete(PlatformToolModel).where(PlatformToolModel.tool_name == tool.tool_name))
            logger.info("  ✓ 删除工具: %s", tool.tool_name)

        # 删除 card templates
        for tpl in CARD_TEMPLATES:
            await db.execute(delete(PlatformCardTemplateModel).where(PlatformCardTemplateModel.template_id == tpl.template_id))
            logger.info("  ✓ 删除卡片模板: %s", tpl.template_id)

        await db.commit()
        logger.info("🧹 种子数据清除完成")


def main():
    parser = argparse.ArgumentParser(description="电信客服模拟场景 — 平台种子脚本")
    parser.add_argument("--clean", action="store_true", help="清除种子数据")
    args = parser.parse_args()

    if args.clean:
        asyncio.run(clean())
    else:
        asyncio.run(seed())


if __name__ == "__main__":
    main()
