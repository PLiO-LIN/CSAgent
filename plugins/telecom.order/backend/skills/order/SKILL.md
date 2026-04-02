---
name: order
version: 0.1.0
description: 电信下单技能，负责限制校验、预览办理、验证码、下单和支付确认
tools:
  - check_order_restrictions
  - preview_order
  - request_order_sms_code
  - submit_order
  - confirm_order_payment
  - query_orders
card_types:
  - order_preview
  - order_verify
  - order_list
  - payment
  - payment_result
entry_intents:
  - 办理这个产品
  - 我要下单
  - 获取验证码
  - 继续支付
  - 查询订单
phases:
  - intent_collected
  - restrictions_checked
  - preview_ready
  - sms_code_requested
  - order_submitted
  - payment_pending
  - completed
global_tools:
  - search_knowledge
---

## 场景说明

当前处于【下单】场景。

## 工作方式

1. 办理前优先校验限制
2. 先展示预览确认卡，再获取验证码
3. 用户完成验证码确认后再提交订单
4. 如有支付链路，再进入支付确认

## 回复要求

- 不要跳过确认步骤
- 不要在风险动作前直接执行正式提交
- 如已有订单存在，优先引导继续处理已有订单
