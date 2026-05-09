# API 中转站测试与聊天工作台

这是一个纯前端的 API 中转站测试工具，用于统一管理多个 OpenAI 兼容中转站，并测试接口连通性、模型列表、聊天请求和响应速度。

## 技术栈

- Vue 3
- Vite
- TypeScript
- Element Plus
- Playwright

## 开发命令

```bash
npm install
npm run dev
npm run build
npx playwright test
```

当前 Vite 固定端口：

```text
http://127.0.0.1:5174/
```

## 当前功能

### 中转管理

中转管理是唯一维护中转站档案的地方。每个中转站保存：

- 名称
- API Base URL
- API Key
- 模型
- 模型列表
- 备注
- 启用/停用状态

填写 Base URL 和 API Key 后，可以点击 `获取模型` 请求 `/models`。如果返回 OpenAI 兼容格式，例如 `{ data: [{ id: "model-name" }] }`，页面会自动生成模型下拉选择；如果获取失败或格式不兼容，仍可手动输入模型。

### 当前会话设置

原来的 `API 配置` 已改成当前会话设置，不再重复编辑 Base URL、Key、模型。

当前会话设置只负责：

- 选择当前中转站
- 选择接口模式：`Chat Completions` 或 `Responses API`
- 选择请求通道：浏览器直连或本地代理
- 设置 temperature
- 设置系统提示词
- 设置流式/普通响应

接口测试、聊天测试、curl、请求预览都会使用当前中转站档案里的 Base URL、Key、模型。

请求通道说明：

- 浏览器直连：页面直接请求中转站，要求中转站正确支持 CORS。
- 本地代理：页面请求 Vite dev server 的 `/api/openai-proxy/...`，再由本机转发到中转站，可避开中转站拒绝浏览器 `OPTIONS` 预检导致的 CORS 错误。

本地代理只在 `npm run dev` 启动的本地开发服务中可用。静态部署后的纯前端页面没有转发能力，需要额外后端代理。

### 接口测试

支持：

- `GET /models`
- `POST /chat/completions`
- `POST /responses`

接口测试页可以直接切换：

- `Chat Completions`
- `Responses API`

切到 Responses API 后，请求预览会显示 `/responses` 格式，例如：

```json
{
  "model": "gpt-4.1-mini",
  "input": [
    {
      "role": "system",
      "content": "你是一个简洁、准确的助手。"
    },
    {
      "role": "user",
      "content": "请只回复：pong"
    }
  ],
  "temperature": 0.7,
  "stream": true
}
```

### 聊天测试

聊天测试使用当前中转站和当前接口模式。

支持：

- Chat Completions 普通响应
- Chat Completions 流式响应
- Responses API 普通响应
- Responses API 流式响应

Responses API 流式输出目前解析 `response.output_text.delta` 事件。

### 中转测速

中转测速直接读取 `中转管理` 里已启用的中转站档案。

模式：

- 连通性测试：不需要 Key，只测试浏览器能否请求到 `/models` 并拿到 HTTP 状态。
- 真实速度测试：使用每个中转站档案自己的 Key 和模型，测试 `/models` 与当前生成接口。

测速结果按成功优先、总耗时从低到高排序。

### 请求历史

保存最近 50 条请求历史。

## 数据保存

当前版本是纯前端工具，没有后端数据库。

所有数据保存在当前浏览器的 `localStorage`：

```text
api-relay-workbench-state-v1
```

保存内容包括：

- 当前会话设置
- 中转站档案
- API Key
- 聊天消息
- 请求历史

注意：API Key 只保存在本机浏览器，但仍是明文 localStorage。生产化或多人使用时，应改成后端加密保存或只在运行时输入。

## 关键文件

```text
src/App.vue
src/lib/types.ts
src/lib/storage.ts
src/lib/openaiClient.ts
src/style.css
playwright.config.ts
tests/app.spec.ts
```

### src/lib/openaiClient.ts

封装 OpenAI 兼容请求：

- `listModels`
- `createChatCompletion`
- `streamChatCompletion`
- `createResponse`
- `streamResponse`
- `buildChatBody`
- `buildResponsesBody`
- `extractAssistantText`
- `extractResponseText`

### src/lib/storage.ts

负责 localStorage 读写、默认状态、旧数据兼容迁移。

旧版 API 配置里的 Base URL/Key/模型会迁移为 `历史当前配置` 中转站。

## 给下次 AI 的上下文

这个项目的核心设计是：

```text
中转管理 = 多个中转站档案库
当前会话设置 = 选择当前使用哪个中转站和接口模式
接口测试/聊天测试/测速 = 使用当前中转站或已启用中转站执行请求
```

不要再把 Base URL、API Key、模型重复加回当前会话设置页。它们应只在中转管理里维护。

如果继续开发，优先考虑：

- 给中转站档案增加导入/导出 JSON
- 给请求历史增加详情抽屉
- 给测速结果增加多轮平均耗时
- 给 API Key 增加本地加密或后端保存
- 按需加载 Element Plus，降低打包体积
