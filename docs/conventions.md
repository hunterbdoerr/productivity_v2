# Conventions

Rules for organizing and running tools in this repo. They exist so that a tool
written months ago can be run again without re-reading its source.

These are conventions, not enforcement — nothing in this repo validates them.

## 1. One directory per tool

Every tool lives at `tools/<tool-name>/` and is entirely self-contained:
source, dependencies, config, and data all sit inside that directory.

- **Names** are lowercase with hyphens, and describe what the tool does, not
  how it works: `meeting-notes-cleaner`, not `notion-api-script`.
- **No shared code.** If two tools need the same logic, copy it. Duplication is
  cheaper here than coupling — these tools are small, and a shared library
  means changing one tool can break another.
- **No cross-imports.** A tool must never read files from another tool's
  directory.

The test: deleting any single tool directory breaks nothing else.

## 2. Every tool has a `run` entrypoint

Each tool directory contains an executable file named `run`. This is the one
convention that makes a polyglot repo usable — you never have to remember
whether a given tool is `python main.py`, `npm start`, or `./script.sh`.

```bash
tools/<tool-name>/run [args...]
```

`run` is a shell script with a shebang, marked executable (`chmod +x run`).
It should:

- work when invoked from any directory (resolve paths relative to itself),
- activate or select its own environment (venv, node version) internally,
- pass arguments through to the underlying program,
- fail loudly with a useful message if setup is missing.

A minimal example:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec python3 main.py "$@"
```

If a tool needs a second entrypoint (a setup step, a dev server), add a
sibling script with an obvious name — `setup`, `serve` — and document it in
the tool's README.

## 3. Every tool has a README

`tools/<tool-name>/README.md` covers, briefly:

- **What it does** and why it exists — one or two sentences.
- **Setup** — the exact commands to go from a fresh clone to a working tool.
- **Usage** — how to run it, with a real example invocation.
- **Config** — which environment variables or credentials it needs.
- **Notes** — anything surprising, including known breakage and manual steps.

Write it for yourself in six months, having forgotten everything.

## 4. Dependencies stay local

Pick whatever language suits the problem. Declare dependencies using that
language's normal mechanism, inside the tool's own directory:

| Language | Declare in | Install to |
|---|---|---|
| Python | `requirements.txt` or `pyproject.toml` | `.venv/` in the tool dir |
| Node | `package.json` | `node_modules/` in the tool dir |
| Shell | document required binaries in the README | — |

No dependency manifests at the repo root. No global installs — if a tool needs
a system binary, note it in that tool's README rather than assuming it.

Lockfiles are committed when the language produces one.

## 5. Secrets and config

- **Never commit secrets.** No API keys, tokens, or credentials in source.
- Each tool reads config from environment variables, loaded from a `.env` file
  in its own directory. `.env` is gitignored.
- Commit a `.env.example` listing every variable the tool reads, with
  placeholder values, so the required config is discoverable.

## 6. Data and output

- Tool-generated data goes in `tools/<tool-name>/data/`, which is gitignored.
- Never write to a path outside the tool's own directory unless that is
  explicitly the tool's purpose (e.g. a tool that organizes `~/Downloads`) —
  and say so prominently in the README when it is.
- Prefer plain formats that survive without the tool: JSON, CSV, Markdown,
  SQLite. Avoid pickles and bespoke binary formats.

## 7. Scope

These tools are personal, local, and not productionalized. That is a
deliberate constraint, and it means skipping things that would otherwise be
good practice:

**Skip:** test suites for trivial scripts, CI, Docker, error monitoring,
abstraction layers for hypothetical future needs, configurable behavior you
have never needed, packaging for distribution.

**Keep:** a working `run` script, an honest README, and code you can still
read later.

Crash on bad input rather than handling every edge case — you are the only
user, and you can read a stack trace.

Add tests only where a bug would be silent or expensive: data transformations,
anything that deletes or overwrites files, anything whose output you would
trust without checking.

## 8. Committing

- Commit each tool separately; don't mix changes to two tools in one commit.
- Prefix messages with the tool name: `meeting-notes-cleaner: handle empty input`.
- Repo-wide changes (docs, gitignore) use no prefix.

## 9. Retiring a tool

When a tool stops being useful, delete the directory. Git remembers it. Do not
accumulate dead code behind flags or comments — nothing depends on it, so
there is nothing to preserve.
