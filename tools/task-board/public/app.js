'use strict';

const state = { projects: null, daily: null, todos: null };
let currentCardId = null;
// Column whose add-input should regain focus after the next board render, so
// adding several cards in a row doesn't need a click between each.
let refocusColumn = null;

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of [].concat(children)) node.append(c);
  return node;
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

/* ---------- persistence ---------- */

let statusTimer;
function setStatus(text, clearAfter = 0, isError = false) {
  const node = $('#status');
  node.textContent = text;
  node.classList.toggle('error', isError);
  clearTimeout(statusTimer);
  if (clearAfter) statusTimer = setTimeout(() => { node.textContent = ''; node.classList.remove('error'); }, clearAfter);
}

// One save chain per store, so rapid edits can't write out of order.
const saveChains = {};
function save(name) {
  const run = async () => {
    setStatus('Saving…');
    const res = await fetch(`/api/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state[name]),
    });
    if (!res.ok) throw new Error(await res.text());
    setStatus('Saved', 1500);
  };
  saveChains[name] = (saveChains[name] || Promise.resolve())
    .then(run)
    .catch((err) => setStatus(`Save failed — ${err.message}`, 0, true));
  return saveChains[name];
}

async function loadAll() {
  for (const name of ['projects', 'daily', 'todos']) {
    const res = await fetch(`/api/${name}`);
    if (!res.ok) throw new Error(`could not load ${name}`);
    state[name] = await res.json();
  }
}

/* ---------- dates ---------- */

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeek = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }; // Monday
const startOfMonth = (d) => { const x = startOfDay(d); x.setDate(1); return x; };

function isDue(item) {
  if (!item.lastCompletedAt) return true;
  const last = new Date(item.lastCompletedAt);
  const now = new Date();
  switch (item.frequency) {
    case 'weekdays': {
      const day = now.getDay();
      if (day === 0 || day === 6) return false;
      return last < startOfDay(now);
    }
    case 'weekly': return last < startOfWeek(now);
    case 'monthly': return last < startOfMonth(now);
    default: return last < startOfDay(now);
  }
}

function fmtWhen(iso) {
  if (!iso) return 'never';
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

/* ---------- projects (kanban) ---------- */

// Columns are renameable, so status names map to a tone where we recognise
// them and fall back to a rotating palette where we don't.
const COLUMN_TONES = {
  backlog: 'slate', todo: 'slate', 'to do': 'slate', ideas: 'slate',
  'in progress': 'blue', doing: 'blue', active: 'blue', 'in flight': 'blue',
  review: 'purple', 'in review': 'purple', qa: 'purple',
  blocked: 'red', stuck: 'red',
  waiting: 'amber', 'on hold': 'amber', paused: 'amber',
  done: 'green', shipped: 'green', complete: 'green', completed: 'green',
};
const TONE_CYCLE = ['slate', 'blue', 'purple', 'amber', 'teal', 'green', 'red'];

// Assign tones for the whole board at once: recognised names keep their
// meaning, and the rest draw from the tones nobody claimed, so two adjacent
// columns don't land on the same colour.
function columnTones(columns) {
  const named = columns.map((c) => COLUMN_TONES[c.trim().toLowerCase()] ?? null);
  const taken = new Set(named.filter(Boolean));
  const spare = TONE_CYCLE.filter((t) => !taken.has(t));
  const pool = spare.length ? spare : TONE_CYCLE;
  let next = 0;
  return named.map((tone) => tone ?? pool[next++ % pool.length]);
}


function renderProjects() {
  const board = $('#board');
  board.textContent = '';
  const { columns, cards } = state.projects;
  const tones = columnTones(columns);

  columns.forEach((column, columnIndex) => {
    const inColumn = cards.filter((c) => c.column === column);
    const list = el('ul', { className: 'cards' });

    for (const card of inColumn) {
      const item = el('li', { className: 'card', draggable: true, tabIndex: 0 }, [
        el('div', { className: 'card-title', textContent: card.title }),
      ]);
      if (card.notes?.length) {
        item.append(el('div', { className: 'card-meta', textContent: `${card.notes.length} note${card.notes.length > 1 ? 's' : ''}` }));
      }
      item.addEventListener('click', () => openCard(card.id));
      item.addEventListener('keydown', (e) => { if (e.key === 'Enter') openCard(card.id); });
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.id);
        e.dataTransfer.effectAllowed = 'move';
        requestAnimationFrame(() => item.classList.add('dragging'));
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      list.append(item);
    }

    if (!inColumn.length) list.append(el('li', { className: 'empty', textContent: 'Nothing here' }));

    const input = el('input', { type: 'text', placeholder: '+ Add card', autocomplete: 'off' });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      cards.push({ id: uid(), title: input.value.trim(), column, notes: [], createdAt: new Date().toISOString() });
      input.value = '';
      refocusColumn = column;
      save('projects');
      renderProjects();
    });

    const columnEl = el('div', { className: `column tone-${tones[columnIndex]}` }, [
      el('div', { className: 'column-head' }, [
        el('span', { textContent: column }),
        el('span', { className: 'count', textContent: String(inColumn.length) }),
      ]),
      list,
      el('div', { className: 'column-add' }, [input]),
    ]);

    columnEl.addEventListener('dragover', (e) => { e.preventDefault(); columnEl.classList.add('drag-over'); });
    columnEl.addEventListener('dragleave', (e) => {
      if (!columnEl.contains(e.relatedTarget)) columnEl.classList.remove('drag-over');
    });
    columnEl.addEventListener('drop', (e) => {
      e.preventDefault();
      columnEl.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      if (id) moveCard(id, column, insertIndexFor(columnEl, e.clientY));
    });

    board.append(columnEl);
    if (refocusColumn === column) input.focus();
  });
  refocusColumn = null;
}

function insertIndexFor(columnEl, clientY) {
  const visible = [...columnEl.querySelectorAll('.card:not(.dragging)')];
  for (let i = 0; i < visible.length; i++) {
    const rect = visible[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return i;
  }
  return visible.length;
}

// Flat card array; order within a column is its order of appearance.
function moveCard(cardId, column, indexInColumn) {
  const cards = state.projects.cards;
  const from = cards.findIndex((c) => c.id === cardId);
  if (from < 0) return;
  const [card] = cards.splice(from, 1);
  card.column = column;

  const inColumn = cards.filter((c) => c.column === column);
  let insertAt;
  if (!inColumn.length) insertAt = cards.length;
  else if (indexInColumn >= inColumn.length) insertAt = cards.indexOf(inColumn[inColumn.length - 1]) + 1;
  else insertAt = cards.indexOf(inColumn[indexInColumn]);

  cards.splice(insertAt, 0, card);
  save('projects');
  renderProjects();
}

/* ---------- card drawer ---------- */

function openCard(id) {
  const card = state.projects.cards.find((c) => c.id === id);
  if (!card) return;
  currentCardId = id;

  $('#card-title').value = card.title;
  const select = $('#card-column');
  select.textContent = '';
  for (const column of state.projects.columns) {
    select.append(el('option', { value: column, textContent: column, selected: column === card.column }));
  }

  const notes = $('#card-notes');
  notes.textContent = '';
  if (!card.notes?.length) {
    notes.append(el('li', { className: 'empty', textContent: 'No notes yet' }));
  }
  for (const note of card.notes ?? []) {
    const remove = el('button', { className: 'link-btn', type: 'button', textContent: 'delete' });
    remove.addEventListener('click', () => {
      card.notes = card.notes.filter((n) => n.id !== note.id);
      save('projects');
      openCard(id);
      renderProjects();
    });
    notes.append(el('li', { className: 'note' }, [
      el('div', { className: 'note-text', textContent: note.text }),
      el('div', { className: 'note-foot' }, [
        el('span', { textContent: new Date(note.at).toLocaleString() }),
        remove,
      ]),
    ]));
  }

  $('#overlay').hidden = false;
  $('#note-text').value = '';
}

function closeCard() {
  $('#overlay').hidden = true;
  currentCardId = null;
}

function currentCard() {
  return state.projects.cards.find((c) => c.id === currentCardId);
}

/* ---------- daily ---------- */

const FREQUENCY_LABEL = { daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly' };

function renderDaily() {
  const due = $('#daily-due');
  const done = $('#daily-done');
  due.textContent = '';
  done.textContent = '';

  const items = state.daily.items;
  const dueItems = items.filter(isDue);
  const doneItems = items.filter((i) => !isDue(i));

  for (const item of dueItems) due.append(dailyRow(item, false));
  for (const item of doneItems) done.append(dailyRow(item, true));

  if (!dueItems.length) due.append(el('li', { className: 'empty', textContent: items.length ? 'All clear.' : 'No recurring checks yet.' }));
  if (!doneItems.length) done.append(el('li', { className: 'empty', textContent: 'Nothing completed yet.' }));

  $('#daily-due-count').textContent = dueItems.length ? `(${dueItems.length})` : '';
  setBadge('#daily-badge', dueItems.length);
}

function dailyRow(item, isDone) {
  const box = el('input', { type: 'checkbox', checked: isDone });
  box.addEventListener('change', () => {
    item.lastCompletedAt = box.checked ? new Date().toISOString() : null;
    save('daily');
    renderDaily();
  });

  const remove = el('button', { className: 'link-btn', type: 'button', textContent: 'delete' });
  remove.addEventListener('click', () => {
    state.daily.items = state.daily.items.filter((i) => i.id !== item.id);
    save('daily');
    renderDaily();
  });

  return el('li', { className: 'row' }, [
    box,
    el('div', { className: 'row-body' }, [
      el('div', { className: 'row-title', textContent: item.title }),
      el('div', { className: 'row-meta' }, [
        el('span', { className: 'chip', textContent: FREQUENCY_LABEL[item.frequency] ?? item.frequency }),
        el('span', { textContent: `  last done ${fmtWhen(item.lastCompletedAt)}` }),
      ]),
    ]),
    remove,
  ]);
}

/* ---------- todos ---------- */

const PRIORITIES = [
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

// Todos written before priorities existed have no priority field.
function normalizeTodos() {
  let changed = false;
  for (const item of state.todos.items) {
    if (!PRIORITIES.some((p) => p.key === item.priority)) {
      item.priority = 'medium';
      changed = true;
    }
  }
  if (changed) save('todos');
}

function renderTodos() {
  const sections = $('#todo-sections');
  const done = $('#todo-done');
  sections.textContent = '';
  done.textContent = '';

  const openItems = state.todos.items.filter((i) => !i.done);
  const doneItems = state.todos.items.filter((i) => i.done);

  for (const { key, label } of PRIORITIES) {
    const inSection = openItems.filter((i) => i.priority === key);
    if (!inSection.length) continue; // empty sections are noise, not structure

    const list = el('ul', { className: 'list' });
    inSection.forEach((item, index) => {
      list.append(todoRow(item, { first: index === 0, last: index === inSection.length - 1 }));
    });

    sections.append(el('section', { className: `todo-section prio-${key}` }, [
      el('h2', { className: 'section-title' }, [
        el('span', { textContent: label }),
        el('span', { className: 'count', textContent: ` (${inSection.length})` }),
      ]),
      list,
    ]));
  }

  if (!openItems.length) sections.append(el('p', { className: 'empty', textContent: 'Nothing to do.' }));

  for (const item of doneItems) done.append(todoRow(item));
  $('#todo-done-count').textContent = doneItems.length ? `(${doneItems.length})` : '';
  $('#todo-done-wrap').hidden = !doneItems.length;
  setBadge('#todos-badge', openItems.length);
}

// Swap with the neighbouring item of the same priority. Order within a
// section is the items' order of appearance in the flat array.
function moveTodo(item, direction) {
  const items = state.todos.items;
  const peers = items.filter((i) => !i.done && i.priority === item.priority);
  const target = peers[peers.indexOf(item) + direction];
  if (!target) return;
  const a = items.indexOf(item);
  const b = items.indexOf(target);
  items[a] = target;
  items[b] = item;
  save('todos');
  renderTodos();
}

// Changing priority drops the item at the bottom of its new section.
function setTodoPriority(item, priority) {
  const items = state.todos.items;
  items.splice(items.indexOf(item), 1);
  item.priority = priority;
  const peers = items.filter((i) => !i.done && i.priority === priority);
  const insertAt = peers.length ? items.indexOf(peers[peers.length - 1]) + 1 : items.length;
  items.splice(insertAt, 0, item);
  save('todos');
  renderTodos();
}

function todoRow(item, position = null) {
  const box = el('input', { type: 'checkbox', checked: !!item.done });
  box.addEventListener('change', () => {
    item.done = box.checked;
    item.completedAt = box.checked ? new Date().toISOString() : null;
    save('todos');
    renderTodos();
  });

  const remove = el('button', { className: 'link-btn', type: 'button', textContent: 'delete' });
  remove.addEventListener('click', () => {
    state.todos.items = state.todos.items.filter((i) => i.id !== item.id);
    save('todos');
    renderTodos();
  });

  const row = el('li', { className: 'row' }, [
    box,
    el('div', { className: 'row-body' }, [
      el('div', { className: 'row-title', textContent: item.title }),
      el('div', { className: 'row-meta', textContent: item.done ? `done ${fmtWhen(item.completedAt)}` : `added ${fmtWhen(item.createdAt)}` }),
    ]),
  ]);

  // Completed items keep their priority but lose the controls for it.
  if (position) {
    const up = el('button', { className: 'move-btn', type: 'button', textContent: '↑', title: 'Move up', disabled: position.first });
    up.setAttribute('aria-label', `Move "${item.title}" up`);
    up.addEventListener('click', () => moveTodo(item, -1));

    const down = el('button', { className: 'move-btn', type: 'button', textContent: '↓', title: 'Move down', disabled: position.last });
    down.setAttribute('aria-label', `Move "${item.title}" down`);
    down.addEventListener('click', () => moveTodo(item, 1));

    const select = el('select', { className: 'prio-select', title: 'Priority' });
    select.setAttribute('aria-label', `Priority for "${item.title}"`);
    for (const { key, label } of PRIORITIES) {
      select.append(el('option', { value: key, textContent: label, selected: key === item.priority }));
    }
    select.addEventListener('change', () => setTodoPriority(item, select.value));

    row.append(el('div', { className: 'row-controls' }, [select, up, down, remove]));
  } else {
    row.append(remove);
  }

  return row;
}

function setBadge(sel, count) {
  const badge = $(sel);
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

/* ---------- wiring ---------- */

function showView(name) {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.view === name));
  }
  for (const view of ['projects', 'daily', 'todos']) {
    $(`#view-${view}`).hidden = view !== name;
  }
  localStorage.setItem('task-board:view', name);
}

function init() {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  }

  $('#daily-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#daily-title').value.trim();
    if (!title) return;
    state.daily.items.push({
      id: uid(), title, frequency: $('#daily-frequency').value,
      lastCompletedAt: null, createdAt: new Date().toISOString(),
    });
    $('#daily-title').value = '';
    save('daily');
    renderDaily();
  });

  $('#todo-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#todo-title').value.trim();
    if (!title) return;
    state.todos.items.push({
      id: uid(), title, done: false, priority: $('#todo-priority').value,
      createdAt: new Date().toISOString(), completedAt: null,
    });
    $('#todo-title').value = '';
    save('todos');
    renderTodos();
  });

  $('#card-title').addEventListener('change', () => {
    const card = currentCard();
    const title = $('#card-title').value.trim();
    if (!card || !title) return;
    card.title = title;
    save('projects');
    renderProjects();
  });

  $('#card-column').addEventListener('change', () => {
    const card = currentCard();
    if (card) moveCard(card.id, $('#card-column').value, Infinity);
  });

  $('#note-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const card = currentCard();
    const text = $('#note-text').value.trim();
    if (!card || !text) return;
    card.notes = card.notes ?? [];
    card.notes.push({ id: uid(), text, at: new Date().toISOString() });
    save('projects');
    openCard(card.id);
    renderProjects();
  });

  $('#note-text').addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') $('#note-form').requestSubmit();
  });

  $('#card-delete').addEventListener('click', () => {
    const card = currentCard();
    if (!card || !confirm(`Delete "${card.title}" and its notes?`)) return;
    state.projects.cards = state.projects.cards.filter((c) => c.id !== card.id);
    save('projects');
    closeCard();
    renderProjects();
  });

  // Submit these forms on Enter explicitly. preventDefault stops the browser's
  // implicit submission so the item can never be added twice.
  for (const [input, form] of [['#daily-title', '#daily-form'], ['#todo-title', '#todo-form']]) {
    $(input).addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      $(form).requestSubmit();
    });
  }

  $('#card-close').addEventListener('click', closeCard);
  $('#overlay').addEventListener('click', (e) => { if (e.target === $('#overlay')) closeCard(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#overlay').hidden) closeCard(); });
}

loadAll()
  .then(() => {
    init();
    normalizeTodos();
    renderProjects();
    renderDaily();
    renderTodos();
    showView(localStorage.getItem('task-board:view') || 'projects');
  })
  .catch((err) => setStatus(`Load failed — ${err.message}`, 0, true));
