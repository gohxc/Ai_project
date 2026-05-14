"""Anthropic/OpenAI protocol conversion helpers."""

from typing import Any, Literal

from .anthropic import MessagesRequest as AnthropicMessagesRequest
from .anthropic import TokenCountRequest
from .anthropic_native import build_base_native_anthropic_request_body
from .anthropic_to_openai import (
    AnthropicToOpenAIConverter,
    OpenAIConversionError,
    ReasoningReplayMode,
    build_base_request_body,
)
from .sse import ContentBlockManager, SSEBuilder, format_sse_event, map_stop_reason

ReasoningReplayValue = (
    ReasoningReplayMode
    | Literal[
        "disabled",
        "think_tags",
        "reasoning_content",
    ]
)


def _coerce_reasoning_replay(value: ReasoningReplayValue) -> ReasoningReplayMode:
    if isinstance(value, ReasoningReplayMode):
        return value
    return ReasoningReplayMode(value)


def convert_anthropic_to_openai_chat(
    request: AnthropicMessagesRequest | Any,
    *,
    default_max_tokens: int | None = None,
    reasoning_replay: ReasoningReplayValue = ReasoningReplayMode.THINK_TAGS,
) -> dict[str, Any]:
    """Convert an Anthropic Messages request to an OpenAI chat-completions body."""
    return build_base_request_body(
        request,
        default_max_tokens=default_max_tokens,
        reasoning_replay=_coerce_reasoning_replay(reasoning_replay),
    )


def convert_anthropic_to_anthropic_messages(
    request: AnthropicMessagesRequest | Any,
    *,
    default_max_tokens: int = 4096,
    thinking_enabled: bool = True,
) -> dict[str, Any]:
    """Serialize an Anthropic Messages request to a native Anthropic-compatible body."""
    return build_base_native_anthropic_request_body(
        request,
        default_max_tokens=default_max_tokens,
        thinking_enabled=thinking_enabled,
    )


__all__ = [
    "AnthropicMessagesRequest",
    "AnthropicToOpenAIConverter",
    "ContentBlockManager",
    "OpenAIConversionError",
    "ReasoningReplayMode",
    "SSEBuilder",
    "TokenCountRequest",
    "build_base_native_anthropic_request_body",
    "build_base_request_body",
    "convert_anthropic_to_anthropic_messages",
    "convert_anthropic_to_openai_chat",
    "format_sse_event",
    "map_stop_reason",
]
