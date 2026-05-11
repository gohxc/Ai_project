# AGENTS.md

This file gives AI coding agents the project-specific context and rules for this repository.

## Project Summary

This is a pure frontend API relay workbench for testing OpenAI-compatible API relay providers.

Main stack:

- Vue 3
- Vite
- TypeScript
- Element Plus
- Playwright

Dev server is fixed to:

```text
http://127.0.0.1:5174/
```

## Required Commands

After meaningful code changes, run:

```bash
npm run build
npx playwright test
```

Playwright is configured to use the locally installed system Chrome through `channel: 'chrome'`. Do not assume Playwright-managed Chromium is installed.

## File Formatting

Editor defaults are defined in `.editorconfig`:

- UTF-8 charset
- LF line endings
- insert final newline
- space indentation
- 4-space indent size

Git line-ending normalization is defined in `.gitattributes`: text files use LF by default, while Windows scripts (`*.bat`, `*.cmd`, `*.ps1`) keep CRLF.

## Core Design

The core product model is:

```text
Relay Management = source of truth for relay provider profiles
Current Session Settings = choose active relay and runtime options
Testing/Chat/Benchmark = execute requests using the active or enabled relay profiles
```

Do not reintroduce duplicate Base URL, API Key, or model editing into the current session settings page.

## Page Responsibilities

### Relay Management

Relay Management is the only place to maintain relay profiles.

Each relay profile stores:

- name
- API Base URL
- API Key
- selected model
- fetched model list
- enabled/disabled state
- note

Model fetching uses `/models` and parses OpenAI-compatible `{ data: [{ id }] }` responses. If fetching fails, manual model input must remain possible.

### Current Session Settings

This page was formerly named API Config. It should only handle runtime/session-level options:

- active relay profile
- API mode: Chat Completions or Responses API
- stream mode
- temperature
- system prompt

It may show the active Base URL and model as read-only status only.

### API Testing

API Testing supports:

- `GET /models`
- `POST /chat/completions`
- `POST /responses`

The testing page must show the selected API mode directly and preview the actual request body for the test request.

For Responses API, the request body should use:

```json
{
  "model": "model-name",
  "input": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "请只回复：pong" }
  ],
  "temperature": 0.7,
  "stream": true
}
```

### Chat Testing

Chat testing uses the active relay profile plus the current session settings.

Supported modes:

- Chat Completions normal response
- Chat Completions streaming response
- Responses API normal response
- Responses API streaming response

Responses API streaming currently parses `response.output_text.delta`.

### Relay Benchmark

Relay Benchmark uses enabled relay profiles from Relay Management.

Modes:

- Connectivity test: no API key required; checks whether `/models` returns an HTTP status.
- Real speed test: uses each relay profile's own API Key and model.

Do not make users type relay URLs or API keys again on the benchmark page.

## Data Storage

This project currently has no backend.

All data is stored in browser localStorage under:

```text
api-relay-workbench-state-v1
```

This includes API keys. Treat this as acceptable only for local development and personal testing. If productionizing, move key storage to a backend or add local encryption.

`src/lib/storage.ts` contains default state and migration logic. Older API Config values are migrated into a relay profile named `历史当前配置`.

## Important Files

```text
src/App.vue
src/lib/types.ts
src/lib/storage.ts
src/lib/openaiClient.ts
src/style.css
playwright.config.ts
tests/app.spec.ts
README.md
```

## Implementation Notes

- Prefer the existing single-page structure unless routing becomes clearly necessary.
- Keep the relay profile as the source of truth for Base URL, API Key, and model.
- When adding API request features, update request preview, curl output, history, and Playwright coverage together.
- Preserve the pure frontend assumption unless the user explicitly asks for a backend.
- If changing UI behavior, verify with Playwright.
- Element Plus is currently imported globally; build output warns about large chunks. This is known and not currently a blocker.

