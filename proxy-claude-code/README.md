# LLM Protocol Converter

一个轻量的 Python 协议转换库，用于在 Anthropic Messages 和 OpenAI Chat Completions 风格的数据结构之间转换。

当前版本只保留协议转换核心，不包含代理服务、内置模型厂商、API key 管理、Claude Code 启动器、管理界面、机器人或语音转写。

## 功能范围

- Anthropic Messages 请求模型解析。
- Anthropic Messages 请求转换为 OpenAI-compatible `chat/completions` body。
- Anthropic Messages 请求序列化为 Anthropic-compatible `messages` body。
- Anthropic 风格 SSE 事件构造工具。
- Native Anthropic SSE block 归一化工具。

暂不包含完整的 OpenAI Chat 输入到 Anthropic Messages 的双向转换。

## 安装开发依赖

```bash
uv sync
```

## 使用示例

### Anthropic Messages -> OpenAI Chat Completions

```python
from protocols import AnthropicMessagesRequest, convert_anthropic_to_openai_chat

request = AnthropicMessagesRequest.model_validate(
    {
        "model": "example-model",
        "system": "Be brief.",
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 128,
    }
)

body = convert_anthropic_to_openai_chat(request)
```

输出示例：

```python
{
    "model": "example-model",
    "messages": [
        {"role": "system", "content": "Be brief."},
        {"role": "user", "content": "Hello"},
    ],
    "max_tokens": 128,
}
```

### Anthropic Messages -> Anthropic-compatible body

```python
from protocols import AnthropicMessagesRequest, convert_anthropic_to_anthropic_messages

request = AnthropicMessagesRequest.model_validate(
    {
        "model": "example-model",
        "messages": [{"role": "user", "content": "Hello"}],
    }
)

body = convert_anthropic_to_anthropic_messages(
    request,
    default_max_tokens=4096,
    thinking_enabled=True,
)
```

## 公开 API

```python
from protocols import (
    AnthropicMessagesRequest,
    AnthropicToOpenAIConverter,
    OpenAIConversionError,
    ReasoningReplayMode,
    SSEBuilder,
    convert_anthropic_to_anthropic_messages,
    convert_anthropic_to_openai_chat,
)
```

## 开发检查

```bash
uv run ruff format
uv run ruff check
uv run ty check
uv run pytest
```
