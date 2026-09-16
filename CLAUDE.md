# CLAUDE.md

Personal productivity tools. Read [docs/conventions.md](docs/conventions.md)
before adding or changing a tool — it defines the structure this repo relies on.

## Non-negotiables

- One self-contained tool per `tools/<tool-name>/` directory. Never share code
  between tools or import across directories — copy instead.
- Every tool has an executable `run` entrypoint and a `README.md`.
- Dependencies, config, and data stay inside the tool's own directory.
- Never commit secrets. Config comes from a gitignored `.env`; list every
  variable in a committed `.env.example`.
- **A tool's `data/` directory is the user's real data.** Never seed test
  fixtures into it, never "clean up" by writing empty state over it, and never
  point a test run at it. Use the tool's scratch-directory mechanism (for
  task-board, `TASK_BOARD_DATA`); add one if the tool has none. Snapshot the
  directory before any change that could write to it.

## Scope

These tools are local, personal, and never deployed. Build the simple version.

Do not add, unless explicitly asked: CI, Docker, packaging, abstraction layers
for anticipated needs, configuration options that aren't needed yet, or broad
test suites for scripts.

Do write tests for data transformations and anything that deletes or
overwrites files.

Let scripts crash on bad input rather than defensively handling every edge
case — there is one user, and a stack trace is an acceptable error message.

## Language

Each tool picks its own language; there is no repo default. Match whatever the
tool directory already uses, and check that runtime is installed before
assuming it.
