# telecom.recommend

该插件用于承载电信推荐和产品对比场景。

当前建议迁入的旧版能力：

- `recommend_products`
- `compare_products`

当前建议迁入的卡片类型：

- `recommend_plan`
- `recommend_flow_pack`
- `recommend_benefit`
- `product_compare`

推荐迁移顺序：

1. 先迁推荐工具参数与返回 schema
2. 再迁推荐卡和对比卡 schema
3. 再迁推荐 Skill 及其工作流约束
4. 最后迁前端卡片交互组件
