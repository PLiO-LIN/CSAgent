---
name: recharge
version: 0.1.0
description: 电信充值技能，负责充值预览、金额确认与充值链接生成
tools:
  - preview_recharge
  - create_recharge_link
card_types:
  - recharge
entry_intents:
  - 充值
  - 交话费
  - 生成充值链接
phases:
  - intent_collected
  - recharge_previewed
  - recharge_link_ready
global_tools:
  - search_knowledge
---

## 场景说明

当前处于【充值】场景。

## 工作方式

1. 优先使用 `preview_recharge` 给出账户状态和预填充值金额
2. 如用户修改或确认金额，再调用 `create_recharge_link`
3. 如当前计费方式不支持该链路，应明确告知限制并提示替代渠道

## 回复要求

- 优先展示充值卡片
- 充值金额应允许用户编辑
- 不要直接跳过确认生成最终链接
