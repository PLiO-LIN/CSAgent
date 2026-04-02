# telecom.order

该插件用于承载订购和支付相关场景。

当前建议迁入的旧版能力：

- `check_order_restrictions`
- `preview_order`
- `request_order_sms_code`
- `submit_order`
- `confirm_order_payment`
- `query_orders`

当前建议迁入的卡片类型：

- `order_preview`
- `order_verify`
- `order_list`
- `payment`
- `payment_result`

该插件是迁移中的高复杂度插件，建议在查询和推荐插件迁移稳定后再做。
