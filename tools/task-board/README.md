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
tools/task-board/backup           # snapshot data/ outside the repo (see below)
tools/task-board/run --no-open    # start without opening a browser
PORT=4546 tools/task-board/run    # use a different port

# Point the board at a different data directory. Use this for a scratch board,
# and ALWAYS for testing, so experiments cannot touch the real one.
TASK_BOARD_DATA=/tmp/scratch-board PORT=4546 tools/task-board/run
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

### Backups and recovery

There are two layers, protecting against different things.

**1. Per-write history, inside `data/`.** Every write first copies what was
there to `data/.backups/<store>/<timestamp>.json`, keeping the last 100 versions
of each file (`TASK_BOARD_KEEP_BACKUPS` changes that). Identical writes are
skipped, so the history is real edits rather than churn.

This matters because the page overwrites an entire file whenever anything
changes. A stray write — a stale second tab, a bad hand-edit, a script pointed
at the wrong directory — replaces the whole board. This layer makes that
recoverable rather than final.

To roll back, stop the server and copy the version you want over the live file:

```bash
ls tools/task-board/data/.backups/projects/          # newest is last
cp tools/task-board/data/.backups/projects/2026-09-16T21-11-44-592Z.json \
   tools/task-board/data/projects.json
```

**2. Dated snapshots, outside the repo.** Layer 1 lives inside `data/`, so it
cannot help if the data directory, the tool, or the whole repo goes away. The
`backup` script copies the JSON files to a dated directory in your home folder:

```bash
tools/task-board/backup           # take a snapshot
tools/task-board/backup --list    # list snapshots, newest last
```

Snapshots go to `~/.task-board-backups/<timestamp>/` — **outside this repo, by
design**, so deleting the repo does not take the history with it. The last 60
are kept. A snapshot identical to the previous one is skipped, so a daily
schedule during a quiet week does not push real history out of the window, and
`data/.backups` is excluded so snapshots stay small.

It is safe to snapshot while the board is running: writes are atomic, so a
snapshot catches either the old or the new file, never a half-written one.

To restore a snapshot, stop the server and copy the files back:

```bash
tools/task-board/backup --list
cp ~/.task-board-backups/2026-09-16T16-19-17/*.json tools/task-board/data/
```

Override the defaults with `TASK_BOARD_BACKUP_DIR` and
`TASK_BOARD_KEEP_SNAPSHOTS`.

### Running the snapshot on a schedule

Nothing is scheduled by default. To snapshot every day at 7pm, write this to
`~/Library/LaunchAgents/com.task-board.backup.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.task-board.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/hunterdoerr/Documents/GitHub/productivity_v2/tools/task-board/backup</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>19</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>/tmp/task-board-backup.log</string>
  <key>StandardErrorPath</key><string>/tmp/task-board-backup.log</string>
</dict>
</plist>
```

Then load it, and check it afterwards:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.task-board.backup.plist
launchctl print gui/$(id -u)/com.task-board.backup
```

`launchd` runs a missed job once the Mac wakes, which `cron` does not. To remove
it: `launchctl bootout gui/$(id -u)/com.task-board.backup`.

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
  other's changes — last write wins. Use one tab. A tab left open from before
  an edit made elsewhere will push its stale state on the next change, so
  reload rather than reusing an old tab. The backups above make this
  recoverable.
- **Deletes are immediate** and have no undo. Deleting a card takes its notes
  with it, behind a confirm prompt.
- Writes are atomic (temp file plus rename), so an interrupted write cannot
  leave a half-written board behind.
