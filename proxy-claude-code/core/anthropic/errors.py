"""User-facing error formatting shared by API, providers, and integrations."""

import httpx
import openai


def get_user_facing_error_message(
    e: Exception,
    *,
    read_timeout_s: float | None = None,
) -> str:
    """Return a readable, non-empty error message for users.

    Known transport and OpenAI SDK exception types are mapped to stable wording
    before falling back to ``str(e)``, so empty or noisy SDK messages do not skip
    the mapped path.
    """
    if isinstance(e, httpx.ReadTimeout):
        if read_timeout_s is not None:
            return f"提供方请求在 {read_timeout_s:g}s 后超时。"
        return "提供方请求超时。"
    if isinstance(e, httpx.ConnectTimeout):
        return "无法连接到提供方。"
    if isinstance(e, TimeoutError):
        if read_timeout_s is not None:
            return f"提供方请求在 {read_timeout_s:g}s 后超时。"
        return "请求超时。"

    if isinstance(e, openai.RateLimitError):
        return "提供方触发限流,请稍后重试。"
    if isinstance(e, openai.AuthenticationError):
        return "提供方认证失败,请检查 API 密钥。"
    if isinstance(e, openai.BadRequestError):
        return "发送给提供方的请求无效。"

    name = type(e).__name__
    status_code = getattr(e, "status_code", None)
    if name == "RateLimitError":
        return "提供方触发限流,请稍后重试。"
    if name == "AuthenticationError":
        return "提供方认证失败,请检查 API 密钥。"
    if name == "InvalidRequestError":
        return "发送给提供方的请求无效。"
    if name == "OverloadedError":
        return "提供方当前过载,请稍后重试。"
    if name == "APIError":
        if status_code in (502, 503, 504):
            return "提供方暂时不可用,请稍后重试。"
        return "提供方 api 请求失败。"
    if name.endswith("ProviderError") or name == "ProviderError":
        return "提供方请求失败。"

    message = str(e).strip()
    if message:
        return message

    return "提供方请求意外失败。"


def format_user_error_preview(exc: Exception, *, max_len: int = 200) -> str:
    """Truncate a user-facing error string for short chat replies."""
    return get_user_facing_error_message(exc)[:max_len]


def append_request_id(message: str, request_id: str | None) -> str:
    """Append request_id suffix when available."""
    base = message.strip() or "提供方请求意外失败。"
    if request_id:
        return f"{base} (request_id={request_id})"
    return base
