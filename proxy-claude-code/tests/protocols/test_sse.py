from typing import Any, cast

from protocols import ContentBlockManager, SSEBuilder, map_stop_reason
from protocols.sse import ToolCallState
from protocols.stream_contracts import parse_sse_text


def _parse_sse(sse_str: str) -> dict[str, Any]:
    events = parse_sse_text(sse_str)
    if len(events) != 1:
        raise ValueError(f"expected 1 SSE event, got {len(events)} in {sse_str!r}")
    return events[0].data


def test_map_stop_reason() -> None:
    assert map_stop_reason("stop") == "end_turn"
    assert map_stop_reason("length") == "max_tokens"
    assert map_stop_reason("tool_calls") == "tool_use"
    assert map_stop_reason("content_filter") == "end_turn"
    assert map_stop_reason(None) == "end_turn"
    assert map_stop_reason("unknown") == "end_turn"


def test_content_block_manager_allocates_indexes() -> None:
    manager = ContentBlockManager()
    assert [manager.allocate_index(), manager.allocate_index()] == [0, 1]


def test_flush_task_arg_buffers_logs_digest_not_secret(caplog) -> None:
    manager = ContentBlockManager()
    manager.tool_states[0] = ToolCallState(
        block_index=0, tool_id="call_x", name="Task", started=True
    )
    manager.tool_states[
        0
    ].task_arg_buffer = '{"api_key": "sk-live-super-secret-do-not-log"}not_json'

    with caplog.at_level("WARNING"):
        out = manager.flush_task_arg_buffers()

    assert out == [(0, "{}")]
    text = " | ".join(record.message for record in caplog.records)
    assert "sk-live-super-secret" not in text
    assert "buffer_sha256_prefix=" in text


def test_message_lifecycle_events() -> None:
    builder = SSEBuilder("msg_123", "test-model", input_tokens=50)

    start = _parse_sse(builder.message_start())
    assert start["type"] == "message_start"
    assert start["message"]["id"] == "msg_123"
    assert start["message"]["model"] == "test-model"
    assert start["message"]["usage"] == {"input_tokens": 50, "output_tokens": 1}

    delta = _parse_sse(builder.message_delta("end_turn", 42))
    assert delta["delta"]["stop_reason"] == "end_turn"
    assert delta["usage"]["output_tokens"] == 42

    stop = _parse_sse(builder.message_stop())
    assert stop == {"type": "message_stop"}


def test_message_usage_counters_are_coerced() -> None:
    builder = SSEBuilder("msg_1", "model", input_tokens=3)
    builder.input_tokens = cast(Any, "bad")
    assert _parse_sse(builder.message_start())["message"]["usage"]["input_tokens"] == 0
    assert _parse_sse(builder.message_delta("end_turn", None))["usage"] == {
        "input_tokens": 0,
        "output_tokens": 0,
    }


def test_content_blocks_and_accumulation() -> None:
    builder = SSEBuilder("msg_1", "model")

    start = _parse_sse(builder.start_text_block())
    assert start["content_block"] == {"type": "text", "text": ""}
    assert builder.blocks.text_started is True

    delta = _parse_sse(builder.emit_text_delta("hello"))
    assert delta["delta"] == {"type": "text_delta", "text": "hello"}
    assert builder.accumulated_text == "hello"

    stop = _parse_sse(builder.stop_text_block())
    assert stop["type"] == "content_block_stop"
    assert builder.blocks.text_started is False


def test_tool_block_events() -> None:
    builder = SSEBuilder("msg_1", "model")

    start = _parse_sse(builder.start_tool_block(0, "tool_abc", "Read"))
    assert start["content_block"] == {
        "type": "tool_use",
        "id": "tool_abc",
        "name": "Read",
        "input": {},
    }

    delta = _parse_sse(builder.emit_tool_delta(0, '{"file_path":"a"}'))
    assert delta["delta"] == {
        "type": "input_json_delta",
        "partial_json": '{"file_path":"a"}',
    }

    stop = _parse_sse(builder.stop_tool_block(0))
    assert stop["type"] == "content_block_stop"


def test_estimate_output_tokens_has_fallback() -> None:
    builder = SSEBuilder("msg_1", "model")
    builder.start_text_block()
    builder.emit_text_delta("hello world")
    assert builder.estimate_output_tokens() > 0
