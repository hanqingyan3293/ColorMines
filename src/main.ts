/**
 * Application wiring.
 *
 * Four views — play, settings, history, import/export — so the playing surface
 * shows nothing but the game and its assists. Everything else lives behind the
 * menu (spec: settings must not be reachable mid-game).
 *
 * Deliberately framework-free: the web client and the Tauri client render the
 * same DOM from the same core.
 */

import './style.css';
import { deserializeBoard, newMapId, serializeBoard, type SerializedBoard } from './core/serialize.js';
import {
  TIERS, configToDifficulty, difficultyToConfig, estimateFeasibility, hintBudget,
} from './core/tiers.js';
import {
  applyDirectHint, createSession, cycleMark, elapsedMs, flagCount, correctFlags,
  reveal, type Session,
} from './core/session.js';
import { BoardView } from './ui/board-view.js';
import {
  BUILTIN_SKINS, SKIN_STYLES, applySkin, builtinSkin, skinPalette, validateSkin,
  type Skin, type SkinAxis, type SkinStyle,
} from './ui/skin.js';
import { describeHint, describeStep } from './ui/describe.js';
import type { GenerateRequest, GenerateResponse } from './ui/worker.js';
import {
  DataStore, DEFAULT_SETTINGS,
  isTauri, migrateStores, type HistoryRecord, type Settings, type ShapePrefs, type BackupBundle, createStore,
} from './data/store.js';
import {
  configuredLanguage, initI18n, setLanguage, t, type LanguageSetting,
} from './i18n/index.js';
import { buildReplay, nextHint, replayAt, type ReplayState } from './core/hint.js';
import { solveLogical } from './core/solver-logical.js';
import {
  clearAbnormalExit, logWarn, markCleanExit, markRunning, setDebug, setLogSink,
} from './core/log.js';

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error('missing #' + id);
  return node as T;
};

// ------------------------------------------------------------------ elements
const boardRoot = el('board');
const statusLine = el('statusLine');
const banner = el('banner');
const hudTime = el('hudTime');
const hudFlags = el('hudFlags');
const hudReveals = el('hudReveals');
const bestLine = el('bestLine');
const tierBar = el('tiers');
const nav = el('nav');
const replayPanel = el('replayPanel');
const replayList = el('replayList');
const replayInfo = el('replayInfo');
const debugPanel = el('debugPanel');
const debugInfo = el('debugInfo');
const feasibility = el('feasibility');
const historyList = el('historyList');
const historyStats = el('historyStats');
const mapList = el('mapList');
const dataStatus = el('dataStatus');
const fileInput = el<HTMLInputElement>('fileInput');
const settingsSaved = el('settingsSaved');
const playArea = el('playArea');
const restorePreview = el('restorePreview');
const restoreSummary = el('restoreSummary');

const setSkin = el<HTMLSelectElement>('setSkin');
const setUiStyle = el<HTMLSelectElement>('setUiStyle');
const setBoardStyle = el<HTMLSelectElement>('setBoardStyle');
const setCellStyle = el<HTMLSelectElement>('setCellStyle');
const difficultyRange = el<HTMLInputElement>('setDifficultyRange');
const difficultyInput = el<HTMLInputElement>('setDifficulty');
const difficultyPreview = el('difficultyPreview');
const setW = el<HTMLInputElement>('setW');
const setH = el<HTMLInputElement>('setH');
const setK = el<HTMLInputElement>('setK');
const setBand = el<HTMLInputElement>('setBand');
const setHistoryLimit = el<HTMLInputElement>('setHistoryLimit');
const setTimeoutInput = el<HTMLInputElement>('setTimeout');
let pickedDataDir = '';
const setDebugBox = el<HTMLInputElement>('setDebug');
const languageSelect = el<HTMLSelectElement>('languageSelect');
const restoreSettingsBox = el<HTMLInputElement>('restoreSettings');

// --------------------------------------------------------------------- state
let store = createStore();
let settings: Settings = { ...DEFAULT_SETTINGS };
let session: Session | null = null;
let generating = false;
let ticker: number | null = null;
let hintsUsed = 0;
let lastGeneration = {
  seed: 0, attempts: 0, elapsedMs: 0, nodes: 0, rejectedNonUnique: 0, rejectedStalled: 0, failure: '' as string | undefined,
};
let maxHints = 5;
let replay: ReplayState | null = null;
let shape: ShapePrefs = { ...DEFAULT_SETTINGS.lastShape };
let currentMapId = '';

const view = new BoardView(boardRoot, {
  onMark: (cell) => {
    if (!session) return;
    cycleMark(session, cell);
    view.update(session);
    updateHud();
    if (session.status === 'won') void finish(true);
  },
  onReveal: (cell) => {
    if (!session) return;
    const outcome = reveal(session, cell);
    if (!outcome.changed) return;
    if (outcome.hitMine) void finish(false);
    view.update(session);
    updateHud();
  },
});

// ---------------------------------------------------------------- generation
const worker = new Worker(new URL('./ui/worker.ts', import.meta.url), { type: 'module' });

worker.onmessage = async (event: MessageEvent<GenerateResponse>) => {
  generating = false;
  const { board, elapsedMs: took } = event.data;
  lastGeneration = {
    seed: event.data.seed ?? 0,
    attempts: event.data.attempts ?? 0,
    elapsedMs: took,
    nodes: event.data.nodes ?? 0,
    rejectedNonUnique: event.data.rejectedNonUnique ?? 0,
    rejectedStalled: event.data.rejectedStalled ?? 0,
    failure: event.data.failure,
  };
  if (!board) {
    statusLine.dataset.state = 'error';
    const failed = event.data as GenerateResponse & { failure?: string };
    statusLine.textContent = failed.failure === 'timeout'
      ? t('status.timeout', settings.timeoutMs)
      : t('status.generateFailed');
    return;
  }
  currentMapId = board.mapId;
  session = createSession(deserializeBoard(board));
  hintsUsed = 0;
  maxHints = hintBudget(shape);
  el<HTMLButtonElement>('hintBtn').textContent = t('action.hintCount', '0/' + maxHints);
  view.setBoard(session.board);
  view.update(session);
  banner.hidden = true;
  statusLine.dataset.state = 'ok';
  statusLine.textContent = t(
    'status.started', board.width, board.height, board.colorCount, took)
    + ' · ' + await store.describe();
  updateHud();
  void showBest();
  renderDebug();
  if (ticker !== null) window.clearInterval(ticker);
  ticker = window.setInterval(updateHud, 200);
};

worker.onerror = () => {
  generating = false;
  statusLine.dataset.state = 'error';
  statusLine.textContent = t('status.workerFailed');
};

function startGame(next: ShapePrefs): void {
  if (generating) return;
  shape = next;
  generating = true;
  session = null;
  banner.hidden = true;
  nav.hidden = true; // settings stay out of reach while a game is running
  setView('play');
  statusLine.dataset.state = 'busy';
  statusLine.textContent = t('status.generating');
  const request: GenerateRequest = {
    shape: { width: next.width, height: next.height, colorCount: next.colorCount },
    maxAttempts: 1500,
    seed: (Math.random() * 2 ** 31) | 0,
    maxBand: next.maxBand,
    timeoutMs: settings.timeoutMs,
  };
  worker.postMessage(request);
}

// --------------------------------------------------------------------- views
type ViewName = 'home' | 'play' | 'settings' | 'history' | 'data';

function setView(name: ViewName): void {
  for (const node of Array.from(document.querySelectorAll<HTMLElement>('.view'))) {
    node.hidden = node.id !== 'view' + name[0].toUpperCase() + name.slice(1);
  }
  for (const node of Array.from(document.querySelectorAll<HTMLButtonElement>('.navBtn'))) {
    node.classList.toggle('active', node.dataset.view === name);
  }
  if (name === 'history') void renderHistory();
  if (name === 'data') void renderMaps();
  if (name === 'settings') void renderStorageInfo();
}

for (const node of Array.from(document.querySelectorAll<HTMLButtonElement>('.navBtn'))) {
  node.addEventListener('click', () => {
    const target = node.dataset.view as ViewName;
    if (target === 'play' && !session) {
      startGame(shape);
      return;
    }
    nav.hidden = false;
    setView(target);
  });
}

el('exitGameBtn').addEventListener('click', () => {
  // Abandoning never writes a record: only a finished attempt is history.
  if (session && session.status === 'playing') session.endedAt = Date.now();
  if (ticker !== null) window.clearInterval(ticker);
  ticker = null;
  session = null;
  nav.hidden = false;
  banner.hidden = true;
  setView('play');
});

// ---------------------------------------------------------------------- hud
function updateHud(): void {
  if (!session) return;
  hudTime.textContent = formatDuration(elapsedMs(session));
  hudFlags.textContent = t(
    'hud.flagsValue', correctFlags(session), session.board.colorCount, flagCount(session));
  hudReveals.textContent = String(session.reveals);
}

async function finish(won: boolean): Promise<void> {
  if (!session) return;
  if (ticker !== null) window.clearInterval(ticker);
  ticker = null;
  view.expose(session);
  view.update(session);

  const record: HistoryRecord = {
    recordId: newMapId(),
    mapId: currentMapId,
    at: Date.now(),
    width: session.board.width,
    height: session.board.height,
    colorCount: session.board.colorCount,
    maxBand: shape.maxBand,
    elapsedMs: elapsedMs(session),
    reveals: session.reveals,
    checks: flagCount(session),
    success: won,
    hintsUsed,
    directHintsUsed: session.directHintsUsed,
  };
  // Awaited: the best-score lookup below reads what was just written.
  try {
    await store.appendRecord(record);
  } catch (error) {
    logWarn('app', 'could not record history: ' + String(error));
  }

  let verdict = '';
  if (won && session.directHintsUsed === 0) {
    const previous = DataStore.bestFor(await store.loadHistory(), shape);
    verdict = previous !== null && previous.recordId === record.recordId
      ? t('result.newRecord') : '';
  } else if (won) {
    verdict = t('result.noScore');
  }

  await showBest();
  banner.hidden = false;
  banner.className = won ? 'banner win' : 'banner lose';
  banner.innerHTML = won
    ? t('result.win', formatDuration(elapsedMs(session)), session.reveals, hintsUsed, verdict)
    : t('result.lose');
  nav.hidden = false;
}

async function showBest(): Promise<void> {
  if (!session) return;
  const best = DataStore.bestFor(await store.loadHistory(), shape);
  bestLine.textContent = best
    ? t('score.best', formatDuration(best.elapsedMs), best.reveals, best.hintsUsed)
    : t('score.none');
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

// -------------------------------------------------------------------- hints
el('hintBtn').addEventListener('click', () => {
  if (!session || session.status !== 'playing') return;
  if (hintsUsed >= maxHints) {
    statusLine.dataset.state = 'hint';
    statusLine.textContent = t('status.noHintsLeft', maxHints);
    return;
  }
  const board = session.board;
  const hint = nextHint(session, hintsUsed);
  if (!hint || (hint.cell < 0 && hint.contradiction)) {
    statusLine.textContent = hint?.contradiction ? t(hint.key, ...hint.args) : t('status.noHint');
    return;
  }
  hintsUsed++;
  session.hintsUsed++;
  el('hintBtn').textContent = t('action.hintCount', hintsUsed + '/' + maxHints);
  statusLine.dataset.state = 'hint';

  // Concrete but not an answer: name the colour and the line it is confined to.
  const detail = hint.contradiction
    ? t(hint.key, ...hint.args)
    : describeHint(
        { kind: hint.kind, color: hint.color, row: hint.row, col: hint.col,
          cell: hint.cell, excluded: hint.excluded,
          noteKey: hint.key, noteArgs: hint.args },
        board);
  statusLine.textContent = t('status.hintLeft', detail, maxHints - hintsUsed);
  if (hint.cell >= 0) flash(hint.cell);
});

el('directHintBtn').addEventListener('click', () => {
  if (!session || session.status !== 'playing') return;
  const cell = applyDirectHint(session);
  if (cell === null) {
    statusLine.textContent = t('status.noHint');
    return;
  }
  statusLine.dataset.state = 'hint';
  statusLine.textContent = t('status.directHintUsed');
  view.update(session);
  updateHud();
  if (isWon(session)) void finish(true);
});

const isWon = (s: Session): boolean => s.status === 'won';

function flash(cell: number): void {
  const node = boardRoot.querySelector<HTMLElement>('[data-cell="' + cell + '"]');
  if (!node) return;
  node.classList.add('flash');
  window.setTimeout(() => node.classList.remove('flash'), 1000);
}

// ------------------------------------------------------------------- replay
el('replayBtn').addEventListener('click', () => {
  if (!session) return;
  replay = buildReplay(session);
  replayPanel.hidden = false;
  playArea.classList.add('split');
  replayList.replaceChildren();
  replay.steps.forEach((step, i) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'listItem';
    item.textContent = (i + 1) + '. ' + describeStep(step, (session as Session).board);
    item.addEventListener('click', () => goReplay(i));
    replayList.appendChild(item);
  });
  goReplay(-1);
});

el('replayExit').addEventListener('click', () => {
  replayPanel.hidden = true;
  playArea.classList.remove('split');
  replay = null;
  view.clearReplay();
  if (session) view.update(session);
});

function goReplay(index: number): void {
  if (!session || !replay) return;
  replay = replayAt(
    replay.steps,
    { width: session.board.width, height: session.board.height, colorCount: session.board.colorCount },
    index,
  );
  view.showReplay(replay);
  replayInfo.textContent = index < 0
    ? t('replay.intro', replay.steps.length)
    : t('replay.step', index + 1, replay.steps.length,
        t(replay.steps[index].noteKey, ...replay.steps[index].noteArgs));
}

// ----------------------------------------------------------------- settings
/** Every kind of data gets its own row, so the layout is explicit. */
async function renderDataPaths(): Promise<void> {
  const base = await store.base();
  const dir = document.getElementById('dataDirCurrent');
  if (dir) dir.textContent = base || t('settings.dataDirHint');
  const kinds: Array<[string, string]> = [
    ['pathSettings', 'data/settings.json'],
    ['pathHistory', 'data/history.json'],
    ['pathMaps', 'data/maps/'],
    ['pathLogs', 'data/logs/'],
    ['pathBackups', 'data/backups/'],
  ];
  for (const [id, suffix] of kinds) {
    const node = document.getElementById(id);
    if (node) node.textContent = base + suffix;
  }
}

el('skinExport').addEventListener('click', () => {
  download('colormines-skin-' + activeSkin.id.replace(/[^a-z0-9]+/gi, '-') + '.json', activeSkin);
  dataStatus.textContent = t('status.skinExported');
});

el('skinImport').addEventListener('click', () => {
  pendingMode = 'skin';
  fileInput.accept = 'application/json,.json';
  fileInput.click();
});

el('dataDirPick').addEventListener('click', async () => {
  if (!isTauri()) {
    dataStatus.textContent = t('status.pickUnsupported');
    return;
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  // Open where the data already lives, so picking a sibling folder is one click.
  const picked = await open({
    directory: true,
    multiple: false,
    title: t('settings.dataDir'),
    defaultPath: pickedDataDir || (await store.base()),
  });
  if (typeof picked === 'string' && picked) {
    pickedDataDir = picked;
    await renderDataPaths();
  }
});

el('dataDirMigrate').addEventListener('click', async () => {
  if (!pickedDataDir) {
    dataStatus.textContent = t('status.migrateNeedTarget');
    return;
  }
  const from = store;
  const to = createStore(pickedDataDir);
  const result = await migrateStores(from, to);
  if (result.failed.length > 0) {
    dataStatus.textContent = t('status.migrateFailed', result.failed.join(', '));
    return;
  }
  // Only switch once every file is present and intact at the destination.
  store = to;
  settings = { ...settings, dataDir: pickedDataDir };
  await store.saveSettings(settings);
  dataStatus.textContent = t('status.migrated', result.copied);
  await renderDataPaths();
  void renderStorageInfo();
});

el('dataDirReset').addEventListener('click', async () => {
  pickedDataDir = '';
  await renderDataPaths();
});

/**
 * One knob for overall difficulty. Dragging walks the ramp; typing accepts any
 * value past the slider's maximum and simply clamps the slider's thumb.
 */
function applyDifficulty(level: number, writeToFields = true): void {
  const config = difficultyToConfig(level);
  if (writeToFields) {
    setW.value = String(config.width);
    setH.value = String(config.height);
    setK.value = String(config.colorCount);
    setBand.value = String(config.maxBand);
  }
  difficultyPreview.textContent = t('settings.difficultyPreview',
    config.width, config.height, config.colorCount,
    config.maxBand > 1 ? t('settings.difficultyGrouped') : '');
  refreshFeasibility();
}

function syncDifficulty(source: 'slider' | 'box'): void {
  if (source === 'slider') {
    difficultyInput.value = difficultyRange.value;
    applyDifficulty(Number(difficultyRange.value));
  } else {
    const value = Number(difficultyInput.value);
    if (!Number.isFinite(value)) return;
    difficultyRange.value = String(Math.min(Number(difficultyRange.max), Math.max(0, value)));
    applyDifficulty(value);
  }
}

let activeSkin: Skin = BUILTIN_SKINS[1];

/** Applies a skin everywhere: CSS vars, glyphs, and a board repaint. */
function useSkin(skin: Skin): void {
  activeSkin = skin;
  applySkin(skin);
  view.setGlyphs(skin.glyphs);
  view.setPalette(skinPalette(skin));
  if (session) view.update(session);
}

let importedSkins: Skin[] = [];

async function loadImportedSkins(): Promise<number> {
  importedSkins = [];
  for (const path of await store.listSkinJson()) {
    const id = path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '');
    const text = await store.readSkinJson(id);
    if (!text) continue;
    try {
      importedSkins.push(validateSkin(JSON.parse(text)));
    } catch {
      // A broken skin file must not break the settings page.
      logWarn('skin', 'skipping invalid skin file ' + path);
    }
  }
  return importedSkins.length;
}

function fillStyleOptions(select: HTMLSelectElement, current: SkinAxis): void {
  select.innerHTML = '';
  for (const style of SKIN_STYLES) {
    const option = document.createElement('option');
    option.value = style;
    option.textContent = t('style.' + style);
    select.appendChild(option);
  }
  select.value = current.style;
}

/** Restyles one axis of the active skin without touching the others. */
function applyAxis(which: 'ui' | 'board' | 'cell', style: SkinStyle): void {
  activeSkin = { ...activeSkin, axes: { ...activeSkin.axes, [which]: { style } } };
  useSkin(activeSkin);
}

function fillSkinOptions(): void {
  setSkin.innerHTML = '';
  const add = (skin: Skin, group: string) => {
    const option = document.createElement('option');
    option.value = skin.id;
    option.textContent = group + skin.name;
    setSkin.appendChild(option);
  };
  for (const skin of BUILTIN_SKINS) add(skin, '');
  for (const skin of importedSkins) add(skin, '');
  setSkin.value = settings.skinId || BUILTIN_SKINS[1].id;
  useSkin(findSkin(setSkin.value) ?? BUILTIN_SKINS[1]);
  fillStyleOptions(setUiStyle, activeSkin.axes.ui);
  fillStyleOptions(setBoardStyle, activeSkin.axes.board);
  fillStyleOptions(setCellStyle, activeSkin.axes.cell);
}

function findSkin(id: string): Skin | undefined {
  return builtinSkin(id) ?? importedSkins.find((s) => s.id === id);
}

async function renderStorageInfo(): Promise<void> {
  const info = document.getElementById('storageInfo');
  if (info) info.textContent = await store.describe();
  const build = document.getElementById('buildInfo');
  if (build) build.textContent = t('settings.build') + ' ' + __BUILD_TIME__;
  await renderDataPaths();
  renderHomeConfig();
}

function fillSettings(): void {
  setW.value = String(shape.width);
  setH.value = String(shape.height);
  setK.value = String(shape.colorCount);
  fillSkinOptions();
  void loadImportedSkins().then((count) => { if (count > 0) fillSkinOptions(); });
  // Show where the current custom setup sits on the difficulty ramp.
  const level = configToDifficulty(shape);
  difficultyRange.value = String(Math.min(Number(difficultyRange.max), level));
  difficultyInput.value = String(level);
  setBand.value = String(shape.maxBand);
  setHistoryLimit.value = String(settings.historyLimit);
  setTimeoutInput.value = String(settings.timeoutMs);
  pickedDataDir = settings.dataDir;
  setDebugBox.checked = settings.debug;
  languageSelect.value = configuredLanguage();
  refreshFeasibility();
}

function refreshFeasibility(): void {
  const next = readShape();
  const verdict = estimateFeasibility(
    { width: next.width, height: next.height, colorCount: next.colorCount }, next.maxBand);
  feasibility.textContent = t('feasible.' + verdict);
  feasibility.dataset.state = verdict;
}

function readShape(): ShapePrefs {
  return {
    width: Math.min(24, Math.max(4, Number(setW.value) || 10)),
    height: Math.min(24, Math.max(4, Number(setH.value) || 10)),
    colorCount: Math.max(2, Number(setK.value) || 8),
    maxBand: Math.min(3, Math.max(1, Number(setBand.value) || 1)),
  };
}

setSkin.addEventListener('change', () => {
  const skin = findSkin(setSkin.value);
  if (!skin) return;
  useSkin(skin);
  // Persist immediately: a skin is an appearance preference, and leaving it
  // unsaved would snap back the moment a new round starts.
  settings = { ...settings, skinId: skin.id };
  void store.saveSettings(settings);
});
setUiStyle.addEventListener('change', () => applyAxis('ui', setUiStyle.value as SkinStyle));
setBoardStyle.addEventListener('change', () => applyAxis('board', setBoardStyle.value as SkinStyle));
setCellStyle.addEventListener('change', () => applyAxis('cell', setCellStyle.value as SkinStyle));
for (const input of [setW, setH, setK, setBand]) input.addEventListener('input', refreshFeasibility);
difficultyRange.addEventListener('input', () => syncDifficulty('slider'));
difficultyInput.addEventListener('input', () => syncDifficulty('box'));

function collectSettings(): Settings {
  return {
    ...settings,
    historyLimit: Math.min(500, Math.max(5, Number(setHistoryLimit.value) || 20)),
    timeoutMs: Math.min(60000, Math.max(200, Number(setTimeoutInput.value) || 5000)),
    dataDir: pickedDataDir,
    skinId: setSkin.value,
    debug: setDebugBox.checked,
    lastShape: readShape(),
  };
}

el('settingsSave').addEventListener('click', async () => {
  const previousDir = settings.dataDir;
  settings = collectSettings();
  // Switching the data folder takes effect now, no restart required.
  if (isTauri() && settings.dataDir !== previousDir) {
    store = createStore(settings.dataDir);
    settings = { ...(await store.loadSettings()), ...collectSettings() };
  }
  await store.saveSettings(settings);
  setDebug(settings.debug);
  settingsSaved.hidden = false;
  window.setTimeout(() => { settingsSaved.hidden = true; }, 1500);
  void renderStorageInfo();
});

el('settingsApply').addEventListener('click', async () => {
  const next = readShape();
  if (next.width * next.height < next.colorCount * 2) {
    feasibility.textContent = t('feasible.tooManyColours');
    feasibility.dataset.state = 'unlikely';
    return;
  }
  settings = collectSettings();
  await store.saveSettings(settings);
  setDebug(settings.debug);
  settingsSaved.hidden = false;
  window.setTimeout(() => { settingsSaved.hidden = true; }, 1500);
  startGame(next);
});

// ------------------------------------------------------------------ history
async function renderHistory(): Promise<void> {
  const all = await store.loadHistory();
  const shown = all.slice(0, settings.historyLimit);
  historyStats.textContent = all.length
    ? t('history.shown', shown.length, all.length)
    : t('history.empty');
  historyList.replaceChildren();
  for (const record of shown) {
    const row = document.createElement('div');
    row.className = 'listRow';
    const text = document.createElement('span');
    text.textContent = t(
      'history.entry',
      new Date(record.at).toLocaleString(),
      record.width, record.height, record.colorCount,
      record.success ? t('history.win') : t('history.lose'),
      record.reveals,
      record.hintsUsed,
    ) + (record.success && record.directHintsUsed > 0 ? ' · ' + t('history.noScore') : '');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn ghost small';
    remove.textContent = t('action.delete');
    remove.addEventListener('click', async () => {
      await store.deleteRecord(record.recordId);
      await renderHistory();
    });
    row.append(text, remove);
    historyList.appendChild(row);
  }
}

el('historyClear').addEventListener('click', async () => {
  await store.clearHistory();
  await renderHistory();
});

// --------------------------------------------------------------------- data
async function renderMaps(): Promise<void> {
  const maps = await store.listMaps();
  mapList.replaceChildren();
  if (maps.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = t('data.empty');
    mapList.appendChild(empty);
    return;
  }
  for (const stored of maps) {
    const row = document.createElement('div');
    row.className = 'listRow';
    const label = document.createElement('span');
    label.textContent = stored.name + ' · ' + stored.board.width + 'x'
      + stored.board.height + ' · ' + stored.board.colorCount + ' '
      + t('tier.mines');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'btn small';
    open.textContent = t('action.open');
    open.addEventListener('click', () => openMap(stored.board));
    const dup = document.createElement('button');
    dup.type = 'button';
    dup.className = 'btn small';
    dup.textContent = t('action.duplicate');
    dup.addEventListener('click', async () => {
      await store.duplicateMap(stored.mapId);
      await renderMaps();
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn ghost small';
    del.textContent = t('action.delete');
    del.addEventListener('click', async () => {
      await store.deleteMap(stored.mapId);
      await renderMaps();
    });
    row.append(label, open, dup, del);
    mapList.appendChild(row);
  }
}

function openMap(board: SerializedBoard): void {
  currentMapId = board.mapId;
  session = createSession(deserializeBoard(board));
  shape = {
    width: board.width, height: board.height, colorCount: board.colorCount,
    maxBand: 1,
  };
  hintsUsed = 0;
  maxHints = hintBudget(shape);
  view.setBoard(session.board);
  view.update(session);
  banner.hidden = true;
  nav.hidden = true;
  setView('play');
  statusLine.textContent = t('status.started', board.width, board.height, board.colorCount, 0);
  updateHud();
  void showBest();
  if (ticker !== null) window.clearInterval(ticker);
  ticker = window.setInterval(updateHud, 200);
}

async function saveCurrentMap(): Promise<void> {
  if (!session) return;
  const name = new Date().toLocaleString();
  await store.saveMap(serializeBoard(session.board, currentMapId), name);
  dataStatus.textContent = t('status.saved', name);
}
el('playSaveMap').addEventListener('click', () => { void saveCurrentMap(); });
el('mapSave').addEventListener('click', async () => {
  await saveCurrentMap();
  await renderMaps();
});

function download(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

el('mapExport').addEventListener('click', () => {
  if (!session) return;
  download('colormines-map-' + currentMapId + '.json', serializeBoard(session.board, currentMapId));
  dataStatus.textContent = t('status.exported');
});

el('backupBtn').addEventListener('click', async () => {
  const bundle = await store.createBackup();
  download('colormines-backup-' + Date.now() + '.json', bundle);
  // Also keep one in the data folder, so a backup survives a lost download.
  try {
    const saved = await store.saveBackupToDisk(bundle);
    dataStatus.textContent = t('status.backedUpTo', saved);
  } catch (error) {
    dataStatus.textContent = t('status.backedUp') + ' ' + String(error);
  }
});

let pendingMode: 'map' | 'backup' | 'skin' = 'map';
el('mapImport').addEventListener('click', () => {
  pendingMode = 'map';
  fileInput.click();
});
el('restoreBtn').addEventListener('click', () => {
  pendingMode = 'backup';
  fileInput.click();
});

let pendingBackup: BackupBundle | null = null;

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    const parsed: unknown = JSON.parse(await file.text());
    if (pendingMode === 'map') {
      const stored = await store.importMap(parsed as SerializedBoard, file.name);
      dataStatus.textContent = stored
        ? t('status.imported', file.name)
        : t('status.importSkipped');
      await renderMaps();
    } else if (pendingMode === 'skin') {
      try {
        const skin = validateSkin(parsed);
        await store.saveSkinJson(skin.id, JSON.stringify(skin, null, 2));
        dataStatus.textContent = t('status.skinImported', skin.name);
        await loadImportedSkins();
        fillSkinOptions();
      } catch (error) {
        dataStatus.textContent = t('status.skinRejected',
          error instanceof Error ? error.message : String(error));
      }
    } else {
      // Preview first — nothing is written until the user confirms (spec §18).
      pendingBackup = parsed as BackupBundle;
      const preview = await store.previewRestore(pendingBackup);
      restoreSummary.textContent = t('data.previewBody',
        preview.mapsAdded, preview.mapsSkipped, preview.recordsAdded, preview.recordsSkipped);
      restorePreview.hidden = false;
      dataStatus.textContent = '';
    }
  } catch (error) {
    dataStatus.textContent = error instanceof Error ? error.message : String(error);
  }
});

el('restoreConfirm').addEventListener('click', async () => {
  if (!pendingBackup) return;
  try {
    const result = await store.restoreBackup(pendingBackup, restoreSettingsBox.checked);
    dataStatus.textContent = t('status.restored',
      result.mapsAdded, result.mapsSkipped, result.recordsAdded, result.recordsSkipped);
  } catch (error) {
    dataStatus.textContent = error instanceof Error ? error.message : String(error);
  }
  pendingBackup = null;
  restorePreview.hidden = true;
  await renderMaps();
});

el('restoreCancel').addEventListener('click', () => {
  pendingBackup = null;
  restorePreview.hidden = true;
  dataStatus.textContent = t('data.cancelled');
});

// --------------------------------------------------------------------- tiers
for (const tier of TIERS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tier';
  button.textContent = t('tier.format', t('tier.' + tier.id),
    tier.shape.width, tier.shape.height, tier.shape.colorCount);
  button.addEventListener('click', () => {
    startGame({
      width: tier.shape.width,
      height: tier.shape.height,
      colorCount: tier.shape.colorCount,
      maxBand: 1,
    });
  });
  tierBar.appendChild(button);
}

el('newGameBtn').addEventListener('click', () => startGame(shape));
el('homeQuickStart').addEventListener('click', () => startGame(shape));
el('cardPlay').addEventListener('click', () => startGame(shape));
el('cardSettings').addEventListener('click', () => setView('settings'));
el('cardHistory').addEventListener('click', () => setView('history'));
el('cardData').addEventListener('click', () => setView('data'));

function renderHomeConfig(): void {
  const node = document.getElementById('homeConfig');
  if (!node) return;
  const band = shape.maxBand > 1 ? t('home.grouped', shape.maxBand) : t('home.perLine');
  node.textContent = shape.width + ' x ' + shape.height + ' · '
    + shape.colorCount + ' ' + t('home.mines') + ' · ' + band;
}

// --------------------------------------------------------------------- debug
function renderDebug(): void {
  debugPanel.hidden = !settings.debug;
  if (!settings.debug || !session) return;

  const solved = solveLogical(
    session.board, session.board.colors, session.board.rowCounts, session.board.colCounts,
    session.board.rowBandOf, session.board.colBandOf);
  const parts = [
    t('debug.map', currentMapId.slice(0, 8)),
    t('debug.skin', activeSkin.name),
    t('debug.size', session.board.width, session.board.height, session.board.colorCount),
    t('debug.seed', String(lastGeneration.seed)),
    t('debug.bands', Array.from(session.board.rowBandOf).join(''), Array.from(session.board.colBandOf).join('')),
    t('debug.colors', Array.from(session.board.colors).join('')),
    t('debug.solver', solved.solved ? t('debug.solved') : t('debug.stalled'), String(solved.steps.length),
      String(solved.placedCount)),
    t('debug.generation', String(lastGeneration.attempts), String(lastGeneration.elapsedMs),
      String(lastGeneration.nodes), String(lastGeneration.rejectedNonUnique), String(lastGeneration.rejectedStalled)),
  ];
  if (lastGeneration.failure) parts.push(t('debug.failure', lastGeneration.failure));
  debugInfo.textContent = parts.join('\n');
}

el<HTMLInputElement>('debugShowMines').addEventListener('change', (event) => {
  if (!session) return;
  const on = (event.target as HTMLInputElement).checked;
  for (let i = 0; i < session.marks.length; i++) {
    const node = boardRoot.querySelector<HTMLElement>('[data-cell="' + i + '"]');
    if (node) node.classList.toggle('mine', on && session.board.mines[session.board.colors[i]] === i);
  }
});

// ------------------------------------------------------------------ keyboard
let cursor = 0;
function focusCell(index: number): void {
  cursor = index;
  boardRoot.querySelector<HTMLElement>('[data-cell="' + index + '"]')?.focus();
}

window.addEventListener('keydown', (event) => {
  if (!session) return;
  const target = document.activeElement;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return;
  const w = session.board.width;
  const h = session.board.height;
  let row = Math.floor(cursor / w);
  let col = cursor % w;
  switch (event.key) {
    case 'ArrowUp': row = Math.max(0, row - 1); break;
    case 'ArrowDown': row = Math.min(h - 1, row + 1); break;
    case 'ArrowLeft': col = Math.max(0, col - 1); break;
    case 'ArrowRight': col = Math.min(w - 1, col + 1); break;
    case 'f': case 'F':
      event.preventDefault();
      cycleMark(session, cursor);
      view.update(session);
      updateHud();
      if (session.status === 'won') void finish(true);
      return;
    default: return;
  }
  event.preventDefault();
  focusCell(row * w + col);
});

// -------------------------------------------------------------------- i18n
languageSelect.addEventListener('change', () => {
  setLanguage(languageSelect.value as LanguageSetting);
});

document.addEventListener('colormines:languagechange', () => {
  if (session) {
    view.setBoard(session.board);
    view.update(session);
    void showBest();
    updateHud();
  }
  tierBar.replaceChildren();
  for (const tier of TIERS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tier';
    button.textContent = t('tier.format', t('tier.' + tier.id),
      tier.shape.width, tier.shape.height, tier.shape.colorCount);
    button.addEventListener('click', () => startGame({
      width: tier.shape.width, height: tier.shape.height,
      colorCount: tier.shape.colorCount, maxBand: 1,
    }));
    tierBar.appendChild(button);
  }
  languageSelect.value = configuredLanguage();
  void renderHistory();
  void renderMaps();
});

// --------------------------------------------------------------------- boot
async function boot(): Promise<void> {
  if (clearAbnormalExit()) console.warn(t('status.abnormalExit'));
  markRunning();
  window.addEventListener('beforeunload', markCleanExit);

  setLogSink((entry: string) => { void store.appendLog(entry); });

  settings = await store.loadSettings();
  // A custom data folder means starting over with a store rooted there.
  if (isTauri() && settings.dataDir) {
    store = createStore(settings.dataDir);
    setLogSink((entry: string) => { void store.appendLog(entry); });

  settings = await store.loadSettings();
  }
  setDebug(settings.debug);
  shape = { ...settings.lastShape };
  initI18n();
  fillSettings();
  void renderStorageInfo();
  setView('home');
}

// The service worker exists for the browser build only. On the desktop the
// assets are embedded in the exe, and a cache-first worker there would keep
// serving an old page across updates - which is exactly what happened.
if (isTauri()) {
  navigator.serviceWorker?.getRegistrations?.().then((regs) => {
    for (const reg of regs) void reg.unregister();
  }).catch(() => undefined);
} else // The service worker exists for the browser build only. On the desktop the
// assets are embedded in the exe, and a cache-first worker there would keep
// serving an old page across updates - which is exactly what happened.
if (isTauri()) {
  navigator.serviceWorker?.getRegistrations?.().then((regs) => {
    for (const reg of regs) void reg.unregister();
  }).catch(() => undefined);
} else if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

void boot();
