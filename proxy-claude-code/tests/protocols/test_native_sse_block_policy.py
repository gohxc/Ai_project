import json

from protocols.native_sse_block_policy import (
    NativeSseBlockPolicyState,
    format_native_sse_event,
    transform_native_sse_block_event,
)


def test_thinking_start_dropped_when_disabled() -> None:
    state = NativeSseBlockPolicyState()
    event = format_native_sse_event(
        "content_block_start",
        json.dumps(
            {
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "thinking", "thinking": ""},
            }
        ),
    )

    assert (
        transform_native_sse_block_event(event, state, thinking_enabled=False) is None
    )


def test_thinking_delta_dropped_when_disabled() -> None:
    state = NativeSseBlockPolicyState()
    event = format_native_sse_event(
        "content_block_delta",
        json.dumps(
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "thinking_delta", "thinking": "secret"},
            }
        ),
    )

    assert (
        transform_native_sse_block_event(event, state, thinking_enabled=False) is None
    )


def test_text_block_passthrough_when_thinking_disabled() -> None:
    state = NativeSseBlockPolicyState()
    event = format_native_sse_event(
        "content_block_start",
        json.dumps(
            {
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "text", "text": ""},
            }
        ),
    )

    out = transform_native_sse_block_event(event, state, thinking_enabled=False)

    assert out is not None
    assert '"index": 0' in out


def test_interleaved_thinking_signature_delta_remaps_to_reopened_block_index() -> None:
    state = NativeSseBlockPolicyState()

    def run(event_name: str, payload: dict) -> str | None:
        return transform_native_sse_block_event(
            format_native_sse_event(event_name, json.dumps(payload)),
            state,
            thinking_enabled=True,
        )

    assert run(
        "content_block_start",
        {
            "type": "content_block_start",
            "index": 0,
            "content_block": {"type": "thinking", "thinking": ""},
        },
    )
    assert run(
        "content_block_start",
        {
            "type": "content_block_start",
            "index": 1,
            "content_block": {"type": "text", "text": ""},
        },
    )
    assert run(
        "content_block_delta",
        {
            "type": "content_block_delta",
            "index": 0,
            "delta": {"type": "thinking_delta", "thinking": "plan"},
        },
    )

    out = run(
        "content_block_delta",
        {
            "type": "content_block_delta",
            "index": 0,
            "delta": {"type": "signature_delta", "signature": "sig"},
        },
    )

    assert out is not None
    assert '"index": 2' in out
    assert "signature_delta" in out


def test_startless_text_delta_synthesizes_start_when_thinking_disabled() -> None:
    state = NativeSseBlockPolicyState()
    event = format_native_sse_event(
        "content_block_delta",
        json.dumps(
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "text_delta", "text": "Hello"},
            }
        ),
    )

    out = transform_native_sse_block_event(event, state, thinking_enabled=False)

    assert out is not None
    assert "content_block_start" in out
    assert "Hello" in out
    assert "text_delta" in out
