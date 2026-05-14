# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

BridgeAI Proxy is a local Go HTTP proxy that lets IDEs send AI requests to a locally configured upstream model provider. It supports OpenAI-compatible and Anthropic-compatible APIs and converts request payloads when the IDE protocol and active provider protocol differ.

The product requirements are documented in `AI代理需求说明.md`.

## Common commands

```bash
# Run all tests
go test ./...

# Run tests in one package
go test ./internal/proxy

# Run one test by name
go test ./internal/proxy -run TestOpenAIToAnthropicConversion

# Build the CLI/server binary
go build ./cmd/bridgeai-proxy

# Run the local proxy server
go run ./cmd/bridgeai-proxy

# Format Go code
gofmt -w cmd internal
```

The server currently listens on `127.0.0.1:8080` and stores its SQLite database under the OS user config directory in `bridgeai-proxy/bridgeai.db`.

## Planning

If a planning artifact is needed for work in this repository, write it under this project folder rather than a global Claude location.

## Architecture

- `cmd/bridgeai-proxy/main.go` is the executable entrypoint. It creates the config data directory, opens the SQLite store, and starts the app on `127.0.0.1:8080`.
- `internal/app` wires one `http.ServeMux` with three concerns: GUI routes (`/`, `/providers`, `/providers/...`), proxy API routes (`/v1/chat/completions`, `/v1/messages`), and `/healthz`.
- `internal/gui` is a small server-rendered HTML UI for managing providers. It can save providers and mark one provider active; base URLs are validated as HTTP(S) root URLs without path, query, or fragment.
- `internal/storage` owns SQLite persistence. It creates `providers` and `app_settings` tables at startup, stores provider metadata/API keys/model IDs/protocols, and records the active provider as `app_settings.active_provider_id`.
- `internal/model` defines shared provider and protocol types. Supported protocol values are `openai` and `anthropic`.
- `internal/proxy` is the request forwarding layer. It detects inbound protocol by route, loads the active provider, optionally converts request JSON, sets provider-specific auth headers, and forwards to the provider's standard path (`/v1/chat/completions` or `/v1/messages`).
- `internal/transform/openai` and `internal/transform/anthropic` define the minimal request/response structs and conversion helpers used by the proxy. OpenAI system messages are joined into Anthropic `system`; Anthropic `system` is prepended as an OpenAI system message.

## Protocol behavior

- Inbound OpenAI: `POST /v1/chat/completions`
- Inbound Anthropic: `POST /v1/messages`
- OpenAI provider auth uses `Authorization: Bearer <api key>`.
- Anthropic provider auth uses `x-api-key: <api key>` plus `anthropic-version: 2023-06-01`.
- If inbound and provider protocols match, the JSON body is forwarded unchanged except for destination URL and auth headers.
- If protocols differ, the proxy rewrites only the protocol envelope and uses the active provider's configured model ID.
