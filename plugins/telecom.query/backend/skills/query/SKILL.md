---
name: query
version: 0.1.0
description: 电信查询技能，负责套餐、余额、账单、积分、用户信息等查询场景
tools:
  - query_package
  - query_balance
  - query_bill
  - query_points
  - query_user_info
card_types:
  - package
  - balance
  - bill
  - points
  - user_info
entry_intents:
  - 查套餐
  - 查余额
  - 查账单
  - 查积分
  - 查用户信息
phases:
  - intent_collected
  - queried
global_tools:
  - search_knowledge
---

## 场景说明

当前处于【查询】场景。

## 工作方式

1. 根据用户诉求选择最合适的查询工具
2. 如工具返回结构化卡片，优先结合卡片说明结果
3. 如用户继续追问规则、办理限制或渠道信息，可以补充使用全局 `search_knowledge`

## 回复要求

- 先给出结论，再给必要说明
- 如果有卡片，使用卡片承载结构化结果
- 不要把查询场景直接推进到下单或支付场景
