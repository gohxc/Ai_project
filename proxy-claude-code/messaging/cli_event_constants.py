"""CLI event types and status-line mapping for transcript / UI updates."""

from collections.abc import Callable
from typing import Any

# Status message prefixes used to filter our own messages (ignore echo)
STATUS_MESSAGE_PREFIXES = (
    "⏳",
    "💭",
    "🔧",
    "✅",
    "❌",
    "🚀",
    "🤖",
    "📋",
    "📊",
    "🔄",
)

# Event types that update the transcript (frozenset for O(1) membership)
TRANSCRIPT_EVENT_TYPES = frozenset(
    {
        "thinking_start",
        "thinking_delta",
        "thinking_chunk",
        "thinking_stop",
        "text_start",
        "text_delta",
        "text_chunk",
        "text_stop",
        "tool_use_start",
        "tool_use_delta",
        "tool_use_stop",
        "tool_use",
        "tool_result",
        "block_stop",
        "error",
    }
)

# Event type -> (emoji, label) for status updates (O(1) lookup)
_EVENT_STATUS_MAP: dict[str, tuple[str, str]] = {
    "thinking_start": ("🧠", "Claude 正在思考..."),
    "thinking_delta": ("🧠", "Claude 正在思考..."),
    "thinking_chunk": ("🧠", "Claude 正在思考..."),
    "text_start": ("🧠", "Claude 正在工作..."),
    "text_delta": ("🧠", "Claude 正在工作..."),
    "text_chunk": ("🧠", "Claude 正在工作..."),
    "tool_result": ("⏳", "正在执行工具..."),
}


def get_status_for_event(
    ptype: str,
    parsed: dict[str, Any],
    format_status_fn: Callable[..., str],
) -> str | None:
    """Return status string for event type, or None if no status update needed."""
    entry = _EVENT_STATUS_MAP.get(ptype)
    if entry is not None:
        emoji, label = entry
        return format_status_fn(emoji, label)
    if ptype in ("tool_use_start", "tool_use_delta", "tool_use"):
        if parsed.get("name") == "Task":
            return format_status_fn("🤖", "子代理正在工作...")
        return format_status_fn("⏳", "正在执行工具...")
    return None
