# productivity_v2

A personal collection of small, independent productivity tools.

Each tool solves one problem for one user (me), runs locally, and is never
deployed. There is no shared framework, no shared runtime, and no build
pipeline — tools live side by side and do not import from each other.

## Layout

```
productivity_v2/
├── README.md              # you are here
├── CLAUDE.md              # instructions for Claude Code in this repo
├── docs/
│   └── conventions.md     # the rules for adding and organizing a tool
└── tools/
    └── <tool-name>/       # one self-contained tool per directory
        ├── README.md      # what it does, how to run it
        ├── run            # executable entrypoint (every tool has one)
        └── ...            # whatever that tool needs, in its own language
```

## Running a tool

Every tool exposes the same entrypoint regardless of what it is written in:

```bash
tools/<tool-name>/run
```

First time with a tool you haven't used in a while, read its README — it lists
setup steps and any credentials it expects.

## Adding a tool

Read [docs/conventions.md](docs/conventions.md). The short version:

1. Make `tools/<tool-name>/`.
2. Write the thing in whatever language fits the problem.
3. Add an executable `run` script and a README.
4. Keep dependencies, config, and data inside that directory.

## Principles

- **Simple over general.** Solve today's problem. Do not build a framework.
- **Local only.** No deployment, no hosting, no uptime expectations.
- **Independent.** A tool can be deleted without breaking anything else.
- **Disposable.** These are allowed to rot. Delete what you stop using.
