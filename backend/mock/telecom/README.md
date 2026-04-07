# 电信客服模拟场景 (Telecom Mock)

基于 FastMCP 的电信客服模拟 MCP 服务器，配合平台种子脚本，可快速搭建完整的电信客服演示环境。

## 协议说明

当前 mock server 会直接通过 MCP 协议暴露以下信息：

- Tool 定义 `_meta["io.github.pliolin.csagent/card"]`：声明卡片绑定规则
- Tool 定义 `icons` 与 `_meta["io.github.pliolin.csagent/icons"]`：声明工具图标
- Tool 定义 `outputSchema`：声明结构化输出 schema
- Tool 调用结果 `structuredContent`：承载卡片 JSON 数据

平台在执行 `/api/platform/tools/sync/mcp` 后，会把这些 MCP 元数据同步进平台注册中心，因此本目录的测试流程是：

- 先 seed 卡片模板 / 技能 / 智能体 / MCP 配置
- 再启动 MCP server 与后端
- 再调用 MCP sync 把工具拉进平台
- 最后在前端通过智能体对话验证卡片是否自动渲染

## 文件结构

```
backend/mock/telecom/
├── README.md            # 本文件
├── server.py            # FastMCP 模拟服务器（9 个工具）
├── mock_data.py         # 模拟数据与业务逻辑
├── seed_platform.py     # 平台种子脚本（注册工具/技能/卡片/智能体）
├── klg.xlsx             # 知识库原始数据（15000+ 条 QA）
├── 接口文档.md           # 原始接口文档（参考）
└── 模型文档.txt          # 模型配置说明（参考）
```

## 快速开始

下面这套流程适合你在本地完整验证：

- mock MCP server 是否正常提供工具
- 平台是否能同步 `_meta` / `icons` / `outputSchema`
- Agent 运行时是否能根据 `structuredContent` 自动生成卡片

### 1. 重置并写入种子数据（建议先执行）

如果你想从干净状态开始，可先清理再 seed：

```powershell
conda run -n app_service python -m mock.telecom.seed_platform --clean
conda run -n app_service python -m mock.telecom.seed_platform
```

如果你没有使用 `conda`，把 `conda run -n app_service python` 换成你自己的 Python 解释器即可。

当前种子脚本会自动注册：

- **5 个卡片模板**：客户信息卡、余额卡、用量卡、账单卡、推荐卡
- **3 个技能**：电信查询、套餐推荐、业务订购
- **1 个智能体**：电信客服智能体 `telecom_agent`
- **1 个 MCP 配置**：自动写入 `backend/config.yaml` 的 `mcp.servers.telecom-mock`

注意：

- **MCP 工具不会由 seed 脚本直接写入平台注册表**
- **MCP 工具需要在后端启动后，通过 `/api/platform/tools/sync/mcp` 再同步一次**

### 2. 启动 MCP 模拟服务器

```powershell
python -m mock.telecom.server              # SSE 模式，默认 127.0.0.1:9100
python -m mock.telecom.server --port 9200  # 自定义端口
python -m mock.telecom.server --stdio      # stdio 模式
```

默认推荐直接使用 SSE 模式：

- 地址：`http://127.0.0.1:9100/sse`
- 服务名：`telecom-mock`

### 3. 启动后端

```powershell
conda run -n app_service python main.py
```

默认后端地址：

- `http://127.0.0.1:8200`

### 4. 启动前端

在项目根目录执行：

```powershell
npm install
npm run dev
```

默认前端地址：

- `http://127.0.0.1:3000`

### 5. 同步 MCP 工具到平台注册中心

后端和 MCP server 都启动后，再执行一次 MCP sync：

```powershell
python -c "import urllib.request; req=urllib.request.Request('http://127.0.0.1:8200/api/platform/tools/sync/mcp', method='POST', data=b'', headers={'Content-Type':'application/json'}); print(urllib.request.urlopen(req).read().decode('utf-8'))"
```

如果前端控制台已有 MCP sync 按钮，也可以直接在 UI 里点同步。

### 6. 验证工具是否同步成功

先检查 tool 列表里是否已经出现 `telecom-mock`：

```powershell
python -c "import json,urllib.request; d=json.loads(urllib.request.urlopen('http://127.0.0.1:8200/api/platform/snapshot').read()); print([t['tool_name'] for t in d['tools'] if 'telecom-mock' in t['tool_name']])"
```

预期会看到：

- `mcp__telecom-mock__query_customer_info`
- `mcp__telecom-mock__query_balance`
- `mcp__telecom-mock__query_package_usage`
- `mcp__telecom-mock__query_bill`
- `mcp__telecom-mock__query_points`
- `mcp__telecom-mock__query_subscriptions`
- `mcp__telecom-mock__recommend_packages_tool`
- `mcp__telecom-mock__submit_order`
- `mcp__telecom-mock__search_knowledge`

### 7. 验证卡片绑定元数据是否同步成功

下面以 `query_balance` 为例检查协议字段是否已进入平台：

```powershell
python -c "import json,urllib.request; d=json.loads(urllib.request.urlopen('http://127.0.0.1:8200/api/platform/snapshot').read()); tools={t['tool_name']:t for t in d['tools']}; t=tools['mcp__telecom-mock__query_balance']; print('supports_card=', t['supports_card']); print('card_binding=', t['card_binding']); print('output_schema_exists=', bool(t.get('output_schema'))); print('icons_exists=', bool((t.get('metadata') or {}).get('icons')))"
```

预期结果：

- `supports_card=True`
- `card_binding.template_id=telecom_balance`
- `output_schema_exists=True`
- `icons_exists=True`

### 8. 在平台控制台实际测试

打开前端后，进入：

- 智能体管理
- 选择 `telecom_agent`
- 开始对话

推荐测试语句：

- `帮我查一下 19921199563 的余额`
- `查询一下 19921199563 的客户信息`
- `帮我看一下 19921199563 这个月套餐用量`
- `给 19921199563 推荐几个更合适的套餐`

如果链路正常，你会看到：

- Agent 调用对应 MCP 工具
- 工具返回 `structuredContent`
- 平台根据同步后的 `card_binding` 自动生成卡片
- 前端直接渲染模板卡片，而不是只返回纯文本

### 9. 可选：直接验证 MCP 协议面

如果你想确认 mock server 本身确实发出了 `_meta` / `outputSchema` / `icons`，可以直接用 MCP client 验证：

```powershell
@'
import asyncio
from mcp import ClientSession
from mcp.client.sse import sse_client

async def main():
    async with sse_client("http://127.0.0.1:9100/sse") as streams:
        read_stream, write_stream = streams
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            result = await session.list_tools()
            tool = next(t for t in result.tools if t.name == "query_balance")
            print("tool_name:", tool.name)
            print("title:", tool.title)
            print("meta_keys:", sorted((tool.meta or {}).keys()))
            print("has_output_schema:", isinstance(getattr(tool, "outputSchema", None), dict))
            print("icons_count:", len(getattr(tool, "icons", []) or []))

asyncio.run(main())
'@ | python -
```

预期结果：

- `meta_keys` 包含 `io.github.pliolin.csagent/card`
- `has_output_schema=True`
- `icons_count > 0`

### 10. 最短测试路径

如果你只想快速验证一遍，可以按下面顺序执行：

```powershell
conda run -n app_service python -m mock.telecom.seed_platform
python -m mock.telecom.server
conda run -n app_service python main.py
npm run dev
```

然后再执行：

- `POST /api/platform/tools/sync/mcp`
- 前端进入 `telecom_agent`
- 发送：`帮我查一下 19921199563 的余额`

## 工具清单

| 工具名 | 说明 | 输入参数 |
|--------|------|----------|
| `query_customer_info` | 客户信息查询 | phone |
| `query_balance` | 话费余额查询 | phone |
| `query_package_usage` | 套餐用量查询 | phone, month? |
| `query_bill` | 账单查询 | phone, from_month?, to_month? |
| `query_points` | 积分查询 | phone |
| `query_subscriptions` | 订购关系查询 | phone |
| `recommend_packages_tool` | 套餐推荐 | phone, need_type? |
| `submit_order` | 订购下单 | phone, offer_id, offer_name? |
| `search_knowledge` | 知识库搜索 | query, top_k? |

## 示例对话

```
用户：帮我查一下 19921199563 的余额
助手：[调用 query_balance] 您好，您的话费余额为 ¥801.98（专用 ¥442.00 + 通用 ¥359.98），无欠费。

用户：这个月流量用了多少？
助手：[调用 query_package_usage] 本月流量已用 122.55 GB / 523.48 GB（23%），语音和短信用量极少。

用户：有没有便宜点的套餐推荐？
助手：[调用 recommend_packages_tool] 为您推荐畅享卡29元套餐，10GB流量+100分钟通话，适合低用量用户。

用户：美好家套餐是什么？
助手：[调用 search_knowledge] 云宽带美好家套餐是电信的家庭融合套餐...
```

## 清除种子数据

```bash
cd backend
python -m mock.telecom.seed_platform --clean
```

## 注意事项

- 本目录已加入 `.gitignore`，不会提交到 Git
- 模拟数据为静态数据，所有手机号映射到同一个演示用户
- 知识库搜索使用简单关键词匹配，生产环境应替换为向量检索
- `klg.xlsx` 加载较慢（~15000 行），首次搜索会有几秒延迟，后续缓存
