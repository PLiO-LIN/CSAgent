# telecom.query

该插件用于承载电信查询场景。

当前建议迁入的旧版能力：

- `query_package`
- `query_balance`
- `query_bill`
- `query_points`
- `query_user_info`

对应卡片类型：

- `package`
- `balance`
- `bill`
- `points`
- `user_info`

建议优先级：

1. 先迁 Tool 参数与结果 schema
2. 再迁 Card schema
3. 再迁 Skill prompt
4. 最后把具体渲染组件迁到前端插件层
