# task-board

A very small Jira substitute for one person. Three views over three JSON files:

- **Projects** — a kanban board. Cards move between status columns and hold
  timestamped notes. Each column has its own colour, carried onto its cards.
- **Daily** — standing operational checks on a recurrence (daily, weekdays,
  weekly, monthly). Each shows up under "Due now" once its interval is up.
- **Todos** — one-off items like scheduling a meeting, grouped into High /
  Medium / Low sections and ordered by hand within each section.

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

On **Todos**, pick a priority when adding an item, and change it later with the
dropdown on the row — that moves the item to the bottom of its new section. The
↑ / ↓ buttons reorder an item within its own section only, and are disabled at
the top and bottom. Empty sections are hidden. Completed items keep their
priority but leave the sections until un-checked.

## Config

None. No environment variables, no credentials, no network access — the page
only ever talks to the local server.

## Data

Plain JSON in `data/`, gitignored, one file per view:

- `projects.json` — `{ columns: [...], cards: [{ id, title, column, notes, createdAt }] }`
- `daily.json` — `{ items: [{ id, title, frequency, lastCompletedAt, createdAt }] }`
- `todos.json` — `{ items: [{ id, title, done, priority, createdAt, completedAt }] }`

`priority` is `high`, `medium` or `low`; anything else is treated as `medium`
and rewritten on load, so todos written before priorities existed still work.
Order within a section is the items' order of appearance in the file.

Files are created with sensible defaults on first run. They are meant to be
readable and hand-editable — edit them with the server stopped, since the page
overwrites a whole file when you change something.

To back up or move the board, copy `data/`. To start over, delete it.

### Changing the columns

Edit `columns` in `data/projects.json` while the server is stopped. Cards whose
`column` no longer matches an existing column stop being displayed — they stay
in the file, so fix the value or re-add the column to get them back.

Colours are assigned automatically and not stored in the data. Familiar status
names keep their meaning whatever position they sit in — backlog and to-do are
grey, in-progress and doing blue, review purple, blocked and stuck red, waiting
and on-hold amber, done and shipped green. Any other name takes a colour none
of the recognised columns claimed, so neighbouring columns stay distinguishable;
past seven columns the palette repeats. To recolour a column, rename it to one
of the recognised names or move it in the list.

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
