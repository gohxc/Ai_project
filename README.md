# Ai_project

这是一个用于集中管理 AI 相关工具项目的项目集仓库。

当前仓库已经不再把根目录作为单一应用项目使用，根目录用于放置多个子项目、公共说明和仓库级配置。原来的 API 中转站测试工具已经移动到 `api-relay-workbench/` 目录中。

GitHub 仓库地址：

```text
git@github.com:gohxc/Ai_project.git
```

## 项目结构

```text
Ai_project/
├── README.md
├── .gitignore
└── api-relay-workbench/
    ├── README.md
    ├── package.json
    ├── vite.config.ts
    ├── playwright.config.ts
    ├── src/
    └── tests/
```

## 当前子项目

### api-relay-workbench

`api-relay-workbench` 是一个纯前端的 API 中转站测试与聊天工作台，用于统一管理多个 OpenAI 兼容中转站，并测试接口连通性、模型列表、聊天请求和响应速度。

主要技术栈：

- Vue 3
- Vite
- TypeScript
- Element Plus
- Playwright

主要能力：

- 维护多个 API 中转站档案
- 获取和选择模型列表
- 支持 Chat Completions 和 Responses API
- 支持普通响应和流式响应
- 提供接口测试、聊天测试和中转测速
- 将本地配置和请求历史保存到浏览器 `localStorage`

更多子项目细节请查看：

```text
api-relay-workbench/README.md
```

## 本地运行

进入子项目目录：

```bash
cd api-relay-workbench
```

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

构建：

```bash
npm run build
```

运行 Playwright 测试：

```bash
npx playwright test
```

## 数据与安全说明

`api-relay-workbench` 目前是纯前端工具，没有后端数据库。

中转站配置、API Key、聊天消息和请求历史保存在当前浏览器的 `localStorage` 中。API Key 只保存在本机浏览器，但仍然是明文 localStorage，不适合作为多人共享或生产环境的密钥存储方案。

提交代码到 GitHub 前请确认：

- 不要提交真实 API Key
- 不要提交 `node_modules/`
- 不要提交 `dist/`
- 不要提交 Playwright 测试报告或临时日志

这些文件已经在根目录 `.gitignore` 中排除。

## Git 提交

当前仓库远端应指向：

```bash
git remote -v
```

预期结果：

```text
origin  git@github.com:gohxc/Ai_project.git (fetch)
origin  git@github.com:gohxc/Ai_project.git (push)
```

常用提交流程：

```bash
git status
git add README.md api-relay-workbench
git commit -m "docs: update project collection readme"
git push origin main
```

如果当前分支不是 `main`，请按实际分支名推送。

## 后续规划

这个仓库后续可以继续作为 AI 工具项目集使用。新增项目时建议每个项目独立放在自己的子目录中，并在根目录 README 中补充项目入口、用途和运行方式。
