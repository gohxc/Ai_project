import json

import pytest

from protocols import (
    AnthropicMessagesRequest,
    OpenAIConversionError,
    ReasoningReplayMode,
    convert_anthropic_to_anthropic_messages,
    convert_anthropic_to_openai_chat,
)
from protocols.anthropic import (
    ContentBlockServerToolUse,
    ContentBlockText,
    ContentBlockWebSearchToolResult,
    Message,
    SystemContent,
    Tool,
)


def test_convert_anthropic_text_request_to_openai_chat() -> None:
    req = AnthropicMessagesRequest.model_validate(
        {
            "model": "claude-sonnet-4-5",
            "system": "Be brief.",
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 128,
            "temperature": 0.2,
        }
    )

    body = convert_anthropic_to_openai_chat(req)

    assert body == {
        "model": "claude-sonnet-4-5",
        "messages": [
            {"role": "system", "content": "Be brief."},
            {"role": "user", "content": "Hello"},
        ],
        "max_tokens": 128,
        "temperature": 0.2,
    }


def test_convert_tools_and_tool_results_to_openai_chat() -> None:
    req = AnthropicMessagesRequest.model_validate(
        {
            "model": "m",
            "messages": [
                {"role": "user", "content": "Read file"},
                {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "tool_use",
                            "id": "toolu_1",
                            "name": "Read",
                            "input": {"file_path": "a.txt"},
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "toolu_1",
                            "content": "ok",
                        }
                    ],
                },
            ],
            "tools": [
                {
                    "name": "Read",
                    "description": "Read a file",
                    "input_schema": {
                        "type": "object",
                        "properties": {"file_path": {"type": "string"}},
                    },
                }
            ],
            "tool_choice": {"type": "tool", "name": "Read"},
        }
    )

    body = convert_anthropic_to_openai_chat(req)

    assert body["messages"][1]["tool_calls"] == [
        {
            "id": "toolu_1",
            "type": "function",
            "function": {
                "name": "Read",
                "arguments": json.dumps({"file_path": "a.txt"}),
            },
        }
    ]
    assert body["messages"][2] == {
        "role": "tool",
        "tool_call_id": "toolu_1",
        "content": "ok",
    }
    assert body["tools"][0]["function"]["name"] == "Read"
    assert body["tool_choice"] == {"type": "function", "function": {"name": "Read"}}


def test_reasoning_replay_modes() -> None:
    req = AnthropicMessagesRequest.model_validate(
        {
            "model": "m",
            "messages": [
                {
                    "role": "assistant",
                    "content": "Answer",
                    "reasoning_content": "Hidden chain",
                }
            ],
        }
    )

    body = convert_anthropic_to_openai_chat(
        req, reasoning_replay=ReasoningReplayMode.REASONING_CONTENT
    )
    assert body["messages"][0]["reasoning_content"] == "Hidden chain"

    body = convert_anthropic_to_openai_chat(req, reasoning_replay="think_tags")
    assert body["messages"][0]["content"].startswith("<think>")


def test_openai_conversion_rejects_unknown_top_level_extras() -> None:
    req = AnthropicMessagesRequest.model_validate(
        {
            "model": "m",
            "messages": [{"role": "user", "content": "x"}],
            "unknown": True,
        }
    )

    with pytest.raises(OpenAIConversionError):
        convert_anthropic_to_openai_chat(req)


def test_native_anthropic_body_preserves_cache_control_and_client_hints() -> None:
    req = AnthropicMessagesRequest(
        model="m",
        max_tokens=20,
        messages=[
            Message(
                role="user",
                content=[
                    ContentBlockText.model_validate(
                        {
                            "type": "text",
                            "text": "x",
                            "cache_control": {"type": "ephemeral"},
                        }
                    )
                ],
            )
        ],
        system=[
            SystemContent.model_validate(
                {
                    "type": "text",
                    "text": "s",
                    "cache_control": {"type": "ephemeral"},
                }
            )
        ],
        tools=[
            Tool.model_validate(
                {
                    "name": "n",
                    "input_schema": {"type": "object"},
                    "cache_control": {"type": "ephemeral"},
                }
            )
        ],
        context_management={"edits": [{"type": "clear"}]},
        output_config={"mode": "x"},
    )

    body = convert_anthropic_to_anthropic_messages(req, thinking_enabled=False)

    assert body["messages"][0]["content"][0]["cache_control"] == {"type": "ephemeral"}
    assert body["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert body["tools"][0]["cache_control"] == {"type": "ephemeral"}
    assert body["context_management"] == {"edits": [{"type": "clear"}]}
    assert body["output_config"] == {"mode": "x"}


def test_native_anthropic_body_filters_thinking_history_when_disabled() -> None:
    req = AnthropicMessagesRequest.model_validate(
        {
            "model": "m",
            "messages": [
                {
                    "role": "assistant",
                    "content": [
                        {"type": "thinking", "thinking": "secret"},
                        {"type": "redacted_thinking", "data": "cipher"},
                        {"type": "text", "text": "visible"},
                    ],
                }
            ],
        }
    )

    body = convert_anthropic_to_anthropic_messages(req, thinking_enabled=False)

    assert body["messages"][0]["content"] == [{"type": "text", "text": "visible"}]
    assert body["max_tokens"] == 4096


def test_anthropic_models_parse_server_tool_history() -> None:
    req = AnthropicMessagesRequest.model_validate(
        {
            "model": "m",
            "messages": [
                {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "server_tool_use",
                            "id": "srvtoolu_1",
                            "name": "web_search",
                            "input": {"query": "q"},
                        },
                        {
                            "type": "web_search_tool_result",
                            "tool_use_id": "srvtoolu_1",
                            "content": [{"type": "web_search_result", "title": "T"}],
                        },
                    ],
                }
            ],
        }
    )

    blocks = req.messages[0].content
    assert isinstance(blocks, list)
    assert isinstance(blocks[0], ContentBlockServerToolUse)
    assert isinstance(blocks[1], ContentBlockWebSearchToolResult)
