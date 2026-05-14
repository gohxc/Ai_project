# 本地 AI API 代理程序需求说明

## 1. 项目目标

开发一个本地代理程序，用于接收编程 IDE 发出的 AI 请求，并将请求转发给用户配置的 AI 模型提供商。

该代理需要支持 OpenAI 兼容 API 与 Anthropic 兼容 API 之间的请求格式适配，使不同 IDE 与不同模型服务商之间可以无缝通信。

## 2. 技术选型

### 编程语言

根据当前项目场景在以下语言中选择：

- Go
- Rust

### GUI

推荐提供 GUI 界面，方便用户配置和管理模型参数。

### 数据库

推荐使用：

- SQLite

也可以根据实际项目需求选择更合适的本地存储方案。

## 3. 核心配置能力

程序需要支持在本地配置 AI 模型参数，包括：

- 请求 API 地址
- API 兼容模式
  - OpenAI 兼容
  - Anthropic 兼容
- 模型 ID
- API Key

程序需要根据当前启用或活跃的 AI 模型配置，判断目标模型服务商使用的是 OpenAI 兼容 API 还是 Anthropic 兼容 API。

## 4. 核心转发逻辑

代理程序接收 IDE 发出的请求后，需要根据以下信息决定是否进行格式转换：

1. IDE 请求使用的 API 协议格式
2. 当前启用模型提供商使用的 API 协议格式

处理原则：

- 请求内容本身不应被修改
- 只在协议不一致时重组请求格式
- 转换过程不能影响上下文内容
- 协议一致时直接转发，不做额外转换

## 5. 请求协议转换场景

### 场景 1：Anthropic 请求转 OpenAI 服务

流程：

```text
编程 IDE -> Anthropic 格式 -> 本地代理 -> OpenAI 格式 -> 模型提供商
```

说明：

- IDE 发出 Anthropic 格式请求
- 本地代理当前配置的服务商为 OpenAI 兼容 API
- 代理需要将 Anthropic 格式转换为 OpenAI 格式

### 场景 2：OpenAI 请求转 Anthropic 服务

流程：

```text
编程 IDE -> OpenAI 格式 -> 本地代理 -> Anthropic 格式 -> 模型提供商
```

说明：

- IDE 发出 OpenAI 格式请求
- 本地代理当前配置的服务商为 Anthropic 兼容 API
- 代理需要将 OpenAI 格式转换为 Anthropic 格式

### 场景 3：OpenAI 请求转 OpenAI 服务

流程：

```text
编程 IDE -> OpenAI 格式 -> 本地代理 -> OpenAI 格式 -> 模型提供商
```

说明：

- IDE 发出 OpenAI 格式请求
- 本地代理当前配置的服务商为 OpenAI 兼容 API
- 协议一致，不需要格式转换

### 场景 4：Anthropic 请求转 Anthropic 服务

流程：

```text
编程 IDE -> Anthropic 格式 -> 本地代理 -> Anthropic 格式 -> 模型提供商
```

说明：

- IDE 发出 Anthropic 格式请求
- 本地代理当前配置的服务商为 Anthropic 兼容 API
- 协议一致，不需要格式转换

## 6. 总结

该项目是一个本地 AI API 代理工具，核心能力是支持 OpenAI 兼容 API 与 Anthropic 兼容 API 的双向协议转换。

最终目标是让不同编程 IDE 与不同 AI 模型服务商之间可以通过本地代理完成统一接入和透明转发。
