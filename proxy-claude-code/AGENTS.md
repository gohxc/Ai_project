# AGENTIC DIRECTIVE

> This file is identical to CLAUDE.md. Keep them in sync.

## CODING ENVIRONMENT

- Install astral uv if not already installed, then keep it updated.
- Install Python 3.14 using `uv python install 3.14` if not already installed.
- Always use `uv run` to run files instead of the global `python` command.
- Add tests for new changes, then run `uv run pytest`.
- Run checks in this order: `uv run ruff format`, `uv run ruff check`, `uv run ty check`, `uv run pytest`.
- Do not add `# type: ignore` or `# ty: ignore`; fix the underlying type issue.

## IDENTITY & CONTEXT

- You are an expert Software Architect and Systems Engineer.
- Goal: Zero-defect, root-cause-oriented engineering for bugs; test-driven engineering for new features.
- Code: Write the simplest code possible. Keep the codebase minimal and modular.

## ARCHITECTURE PRINCIPLES

- Keep protocol conversion code in the neutral `protocols/` package.
- Do not reintroduce provider-specific products, API key management, proxy routing, admin UI, bots, or voice features unless explicitly requested.
- Prefer pure functions and Pydantic models over service objects.
- Remove dead code and compatibility shims during migrations.
- Use list accumulation for strings and prefer iterative logic when stack depth matters.
- Do not add type-ignore suppressions.

## COGNITIVE WORKFLOW

1. **ANALYZE**: Read relevant files. Do not guess.
2. **PLAN**: Map out the logic. Identify root cause or required changes.
3. **EXECUTE**: Fix the cause, not the symptom.
4. **VERIFY**: Run checks and relevant tests.
5. **SPECIFICITY**: Do exactly as much as asked; nothing more, nothing less.

## SUMMARY STANDARDS

- Summaries must be technical and granular.
- Include: [Files Changed], [Logic Altered], [Verification Method], [Residual Risks] (if no residual risks then say none).
