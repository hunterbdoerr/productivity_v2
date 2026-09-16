# task-board

A very small Jira substitute for one person. Three views over three JSON files:

- **Projects** — a kanban board. Cards move between status columns and hold
  timestamped notes.
- **Daily** — standing operational checks on a recurrence (daily, weekdays,
  weekly, monthly). Each shows up under "Due now" once its interval is up.
- **Todos** — a flat list for one-off items like scheduling a meeting.

## Setup

None. It needs Node (any recent version) and nothing else — no npm install, no
build step, no dependencies.

## Usage

```bash
tools/task-board/run
```

This starts a local server on <http://127.0.0.1:4545> and opens a browser tab.
Ctrl-C stops it. Your data is written to disk as you work; there is no save
button.

```bash
tools/task-board/run --no-open    # start without opening a browser
PORT=4546 tools/task-board/run    # use a different port
```

### Keyboard

| Where | Key | Does |
|---|---|---|
| Add-card / add-item box | `Enter` | Add, and stay focused for the next one |
| Note box | `Cmd+Enter` | Save the note |
| Card drawer | `Esc` | Close |

Move a card between columns by dragging it, or by opening it and using the
**Status** dropdown. Dragging within a column reorders it.

## Config

None. No environment variables, no credentials, no network access — the page
only ever talks to the local server.

## Data

Plain JSON in `data/`, gitignored, one file per view:

- `projects.json` — `{ columns: [...], cards: [{ id, title, column, notes, createdAt }] }`
- `daily.json` — `{ items: [{ id, title, frequency, lastCompletedAt, createdAt }] }`
- `todos.json` — `{ items: [{ id, title, done, createdAt, completedAt }] }`

Files are created with sensible defaults on first run. They are meant to be
readable and hand-editable — edit them with the server stopped, since the page
overwrites a whole file when you change something.

To back up or move the board, copy `data/`. To start over, delete it.

### Changing the columns

Edit `columns` in `data/projects.json` while the server is stopped. Cards whose
`column` no longer matches an existing column stop being displayed — they stay
in the file, so fix the value or re-add the column to get them back.

## Notes

- **Why a server and not just an HTML file.** A page opened over `file://`
  cannot write to disk, and browsers block it from reading local JSON at all.
  `server.js` is a ~130-line standard-library Node script that serves the page
  and reads/writes the JSON files. It binds to `127.0.0.1`, so it is not
  reachable from the network.
- **No concurrency handling.** Two tabs open at once will overwrite each
  other's changes — last write wins. Use one tab.
- **Deletes are immediate** and have no undo. Deleting a card takes its notes
  with it, behind a confirm prompt.
- Writes are atomic (temp file plus rename), so an interrupted write cannot
  leave a half-written board behind.
