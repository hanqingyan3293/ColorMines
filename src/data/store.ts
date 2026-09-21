/**
 * Data layer (specs §17–§19).
 *
 * One store, two backends:
 *   - Tauri/desktop writes real files under a single "Color Mines" data folder
 *   - the browser (and tests) use localStorage / memory
 *
 * Everything goes through the same safe-write and corruption-recovery rules, so
 * behaviour is identical on both.
 */

import { FORMAT_VERSION, deserializeBoard, type SerializedBoard } from '../core/serialize.js';
import { logWarn } from '../core/log.js';
import { newMapId } from '../core/serialize.js';

// ------------------------------------------------------------------ backends

export interface Fs {
  /** Human-readable backend + location, surfaced in the UI for diagnosis. */
  describe(): Promise<string>;
  /** Root each data path is resolved against; shown per data kind in settings. */
  base(): Promise<string>;
  read(path: string): Promise<string | null>;
  /** Atomic-ish: temp -> verify -> replace (spec §17.1). */
  write(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

/** In-memory backend: deterministic, used by tests. */
export class MemoryFs implements Fs {
  async describe(): Promise<string> { return 'memory (tests)'; }
  async base(): Promise<string> { return 'memory://'; }
  private files = new Map<string, string>();
  /** Set to simulate a crash mid-write. */
  public failWrites = false;

  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }
  async write(path: string, text: string): Promise<void> {
    if (this.failWrites) throw new Error('simulated write failure');
    const tmp = `${path}.tmp`;
    this.files.set(tmp, text);
    if (this.files.get(tmp) !== text) throw new Error('verify failed');
    this.files.set(path, text);
    this.files.delete(tmp);
  }
  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
  async list(prefix: string): Promise<string[]> {
    return [...this.files.keys()].filter((k) => k.startsWith(prefix));
  }
}

/** Browser backend. localStorage has no rename, so swap is a copy. */
export class LocalStorageFs implements Fs {
  async describe(): Promise<string> { return 'browser localStorage'; }
  async base(): Promise<string> { return 'localStorage://'; }
  private prefix = 'colormines.fs.';

  async read(path: string): Promise<string | null> {
    try {
      return localStorage.getItem(this.prefix + path);
    } catch (error) {
      return null;
    }
  }
  async write(path: string, text: string): Promise<void> {
    const tmp = this.prefix + path + '.tmp';
    try {
      localStorage.setItem(tmp, text);
      if (localStorage.getItem(tmp) !== text) throw new Error('verify failed');
      localStorage.setItem(this.prefix + path, text);
      localStorage.removeItem(tmp);
    } catch (error) {
      try {
        localStorage.removeItem(tmp);
      } catch (error) {
        /* ignore */
      }
      throw error;
    }
  }
  async remove(path: string): Promise<void> {
    try {
      localStorage.removeItem(this.prefix + path);
    } catch (error) {
      /* ignore */
    }
  }
  async list(prefix: string): Promise<string[]> {
    const out: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix + prefix)) out.push(key.slice(this.prefix.length));
      }
    } catch (error) {
      /* ignore */
    }
    return out;
  }
}

// ------------------------------------------------------------------- records

export interface ShapePrefs {
  width: number;
  height: number;
  colorCount: number;
  maxBand: number;
}

export interface Settings {
  language: 'auto' | 'zh-CN' | 'en-US';
  historyLimit: number;
  /** Generation wall-clock budget in milliseconds. */
  timeoutMs: number;
  /** Where to keep data; empty means the platform default. */
  dataDir: string;
  /** Active skin id (`builtin:<name>`, or an imported skin's uuid). */
  skinId: string;
  debug: boolean;
  lastShape: ShapePrefs;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'auto',
  historyLimit: 20,
  timeoutMs: 5000,
  dataDir: '',
  skinId: 'builtin:dark',
  debug: false,
  lastShape: { width: 10, height: 10, colorCount: 8, maxBand: 1 },
};

/**
 * One completed attempt (spec §19). Stores the key facts, not the board:
 * the map lives in the library and is referenced by `mapId`.
 */
/** A `.bak` file is untrusted: every record must be structurally sound. */
function isValidHistoryRecord(value: unknown): value is HistoryRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return typeof r.recordId === 'string'
    && typeof r.mapId === 'string'
    && typeof r.at === 'number'
    && typeof r.width === 'number'
    && typeof r.height === 'number'
    && typeof r.colorCount === 'number'
    && typeof r.elapsedMs === 'number'
    && typeof r.success === 'boolean';
}

export interface HistoryRecord {
  recordId: string;
  mapId: string;
  at: number;
  width: number;
  height: number;
  colorCount: number;
  maxBand: number;
  elapsedMs: number;
  /** Reveals are the risky action; `checks` is flag placements. */
  reveals: number;
  checks: number;
  success: boolean;
  /** Normal hints — never invalidate a score (spec §19.1). */
  hintsUsed: number;
  /** Direct hints — the run is recorded but scores nothing. */
  directHintsUsed: number;
}

export interface StoredMap {
  mapId: string;
  name: string;
  /** Serialized board, including the true mine positions (spec §16.2). */
  board: SerializedBoard;
  savedAt: number;
}

export interface BackupBundle {
  formatVersion: number;
  createdAt: number;
  settings: Settings | null;
  maps: StoredMap[];
  history: HistoryRecord[];
}

// --------------------------------------------------------------------- paths

const P = {
  settings: 'data/settings.json',
  history: 'data/history.json',
  map: (id: string) => `data/maps/${id}.json`,
  maps: 'data/maps/',
};

// --------------------------------------------------------------------- store

export class DataStore {
  constructor(readonly fs: Fs) {}

  /** Where data actually lives — shown in settings so a failure is visible. */
  async describe(): Promise<string> {
    return this.fs.describe();
  }

  async base(): Promise<string> {
    return this.fs.base();
  }

  // -- settings ------------------------------------------------------------
  async loadSettings(): Promise<Settings> {
    const text = await this.fs.read(P.settings);
    if (text === null) return { ...DEFAULT_SETTINGS };
    try {
      const parsed = JSON.parse(text) as Partial<Settings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (error) {
      // Corrupt: fall back to defaults and keep the original as .bad (§17.4).
      logWarn('store', 'settings.json was unreadable, falling back to defaults');
      await this.quarantine(P.settings, text);
      return { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.fs.write(P.settings, JSON.stringify(settings, null, 2));
  }

  // -- history -------------------------------------------------------------
  async loadHistory(): Promise<HistoryRecord[]> {
    const text = await this.fs.read(P.history);
    if (text === null) return [];
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('history is not an array');
      return parsed as HistoryRecord[];
    } catch (error) {
      // Try the backup, but never trust it blindly (§17.2/§17.3).
      const backup = await this.fs.read(`${P.history}.bak`);
      if (backup !== null) {
        try {
          const parsed: unknown = JSON.parse(backup);
          if (Array.isArray(parsed) && parsed.every(isValidHistoryRecord)) {
            await this.quarantine(P.history, text);
            return parsed as HistoryRecord[];
          }
        } catch (error) {
          /* fall through */
        }
      }
      await this.quarantine(P.history, text);
      return [];
    }
  }

  async saveHistory(records: HistoryRecord[]): Promise<void> {
    const current = await this.fs.read(P.history);
    if (current !== null) await this.fs.write(`${P.history}.bak`, current);
    await this.fs.write(P.history, JSON.stringify(records, null, 2));
  }

  async appendRecord(record: HistoryRecord): Promise<HistoryRecord[]> {
    const records = await this.loadHistory();
    records.push(record);
    records.sort((a, b) => b.at - a.at);
    await this.saveHistory(records);
    return records;
  }

  async deleteRecord(recordId: string): Promise<HistoryRecord[]> {
    const records = (await this.loadHistory()).filter((r) => r.recordId !== recordId);
    await this.saveHistory(records);
    return records;
  }

  async clearHistory(): Promise<void> {
    await this.saveHistory([]);
  }

  /**
   * Best run for a configuration (spec §19.2): fastest wins, ties broken by
   * fewer checks. Runs that used a direct hint never count.
   */
  static bestFor(records: readonly HistoryRecord[], shape: ShapePrefs): HistoryRecord | null {
    const eligible = records.filter(
      (r) =>
        r.success &&
        r.directHintsUsed === 0 &&
        r.width === shape.width &&
        r.height === shape.height &&
        r.colorCount === shape.colorCount &&
        r.maxBand === shape.maxBand,
    );
    if (eligible.length === 0) return null;
    return eligible.reduce((best, r) => {
      if (r.elapsedMs < best.elapsedMs) return r;
      if (r.elapsedMs === best.elapsedMs && r.checks < best.checks) return r;
      return best;
    });
  }

  // -- maps ----------------------------------------------------------------
  async listMaps(): Promise<StoredMap[]> {
    const paths = await this.fs.list(P.maps);
    const out: StoredMap[] = [];
    for (const path of paths) {
      if (!path.endsWith('.json')) continue;
      const text = await this.fs.read(path);
      if (text === null) continue;
      try {
        out.push(JSON.parse(text) as StoredMap);
      } catch (error) {
        await this.quarantine(path, text);
      }
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  }

  async saveMap(board: SerializedBoard, name: string): Promise<StoredMap> {
    const stored: StoredMap = { mapId: board.mapId, name, board, savedAt: Date.now() };
    await this.fs.write(P.map(stored.mapId), JSON.stringify(stored, null, 2));
    return stored;
  }

  async getMap(mapId: string): Promise<StoredMap | null> {
    const text = await this.fs.read(P.map(mapId));
    if (text === null) return null;
    try {
      return JSON.parse(text) as StoredMap;
    } catch (error) {
      await this.quarantine(P.map(mapId), text);
      return null;
    }
  }

  async renameMap(mapId: string, name: string): Promise<void> {
    const stored = await this.getMap(mapId);
    if (!stored) return;
    await this.saveMap(stored.board, name);
  }

  async deleteMap(mapId: string): Promise<void> {
    await this.fs.remove(P.map(mapId));
  }

  /** A copy is a distinct map: new id, reused board (spec "地图身份"). */
  async duplicateMap(mapId: string): Promise<StoredMap | null> {
    const stored = await this.getMap(mapId);
    if (!stored) return null;
    const copy: SerializedBoard = { ...stored.board, mapId: newMapId() };
    return this.saveMap(copy, `${stored.name} 副本`);
  }

  // -- import / export -----------------------------------------------------
  /**
   * Imports a map document. Returns null when the map is already present
   * (deduplicated by map id, spec §18) and throws on an unsupported version.
   */
  async importMap(data: SerializedBoard, name: string): Promise<StoredMap | null> {
    // Reject unknown versions with a clear message before touching anything.
    deserializeBoard(data);
    const existing = await this.getMap(data.mapId);
    if (existing) return null;
    return this.saveMap(data, name);
  }

  /** What a restore would do, without writing anything (spec §18). */
  async previewRestore(bundle: BackupBundle): Promise<{
    mapsAdded: number; mapsSkipped: number; recordsAdded: number; recordsSkipped: number;
  }> {
    if (bundle.formatVersion !== FORMAT_VERSION) {
      throw new Error('backup-format-' + bundle.formatVersion);
    }
    let mapsAdded = 0;
    let mapsSkipped = 0;
    for (const map of bundle.maps ?? []) {
      if (await this.getMap(map.mapId)) mapsSkipped++;
      else mapsAdded++;
    }
    const records = await this.loadHistory();
    const seen = new Set(records.map((r) => r.recordId));
    let recordsAdded = 0;
    let recordsSkipped = 0;
    for (const record of bundle.history ?? []) {
      if (seen.has(record.recordId)) recordsSkipped++;
      else recordsAdded++;
    }
    return { mapsAdded, mapsSkipped, recordsAdded, recordsSkipped };
  }

  /**
   * A backup is also kept inside the data folder, not only downloaded. Keeps the
   * most recent few so the folder cannot grow without bound.
   */
  async saveBackupToDisk(bundle: BackupBundle, keep = 10): Promise<string> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = 'data/backups/backup-' + stamp + '.json';
    await this.fs.write(path, JSON.stringify(bundle, null, 2));

    const existing = (await this.fs.list('data/backups/'))
      .filter((p) => p.startsWith('data/backups/backup-') && p.endsWith('.json'))
      .sort();
    for (const stale of existing.slice(0, Math.max(0, existing.length - keep))) {
      await this.fs.remove(stale);
    }
    return path;
  }

  async createBackup(): Promise<BackupBundle> {
    return {
      formatVersion: FORMAT_VERSION,
      createdAt: Date.now(),
      settings: await this.fs.read(P.settings).then((t) => (t ? (JSON.parse(t) as Settings) : null)),
      maps: await this.listMaps(),
      history: await this.loadHistory(),
    };
  }

  /**
   * Restores by merging: maps deduplicate by map id, history by record id, and
   * settings are left alone unless asked (spec §18).
   */
  async restoreBackup(bundle: BackupBundle, overwriteSettings: boolean): Promise<{
    mapsAdded: number;
    mapsSkipped: number;
    recordsAdded: number;
    recordsSkipped: number;
  }> {
    if (bundle.formatVersion !== FORMAT_VERSION) {
      throw new Error(`备份版本 ${bundle.formatVersion} 与当前 ${FORMAT_VERSION} 不兼容`);
    }

    let mapsAdded = 0;
    let mapsSkipped = 0;
    for (const map of bundle.maps ?? []) {
      if (await this.getMap(map.mapId)) {
        mapsSkipped++;
        continue;
      }
      await this.saveMap(map.board, map.name);
      mapsAdded++;
    }

    const existing = await this.loadHistory();
    const seen = new Set(existing.map((r) => r.recordId));
    let recordsAdded = 0;
    let recordsSkipped = 0;
    for (const record of bundle.history ?? []) {
      if (seen.has(record.recordId)) {
        recordsSkipped++;
        continue;
      }
      existing.push(record);
      seen.add(record.recordId);
      recordsAdded++;
    }
    if (recordsAdded > 0) {
      existing.sort((a, b) => b.at - a.at);
      await this.saveHistory(existing);
    }

    if (overwriteSettings && bundle.settings) {
      await this.saveSettings({ ...DEFAULT_SETTINGS, ...bundle.settings });
    }
    return { mapsAdded, mapsSkipped, recordsAdded, recordsSkipped };
  }

  /** Appends to `data/logs/app.log`, keeping the file bounded. */
  async appendLog(line: string, keepLines = 200): Promise<void> {
    const path = 'data/logs/app.log';
    try {
      const existing = (await this.fs.read(path)) ?? '';
      const lines = existing ? existing.split('\n') : [];
      lines.push(line);
      const trimmed = lines.slice(-keepLines);
      await this.fs.write(path, trimmed.join('\n'));
    } catch {
      /* logging must never break the game */
    }
  }

  // -- internals -----------------------------------------------------------
  /**
   * Keeps a corrupt original for diagnosis instead of destroying it (§17.3/§17.4).
   */
  private async quarantine(path: string, text: string): Promise<void> {
    await this.fs.write(`${path}.bad`, text);
  }
}

/**
 * Desktop backend: real files under one data folder (spec §17).
 *
 *   <appDataDir>/data/settings.json
 *                    history.json  (+ history.json.bak / .bad)
 *                    maps/<mapId>.json
 *
 * The plugin exposes no rename, so a safe write is
 * write-temp -> read back -> overwrite target -> drop the temp file. The target
 * is therefore never half-written: the temp copy is complete and verified
 * before the real file is touched.
 */
export class TauriFs implements Fs {
  private baseDir = '';
  private lastError = '';
  /** Explicit override from settings; empty falls back to the app data dir. */
  private readonly overrideBase: string;

  constructor(overrideBase = '') {
    this.overrideBase = overrideBase;
  }

  private async ensure(): Promise<void> {
    if (this.baseDir) return;
    const { invoke } = await import('@tauri-apps/api/core');
    const root = this.overrideBase || (await invoke<string>('fs_data_dir'));
    this.baseDir = root.endsWith('/') || root.endsWith('\\') ? root : root + '/';
    try {
      // The full layout from the spec: data/{maps,logs,backups}.
      for (const dir of ['data/maps', 'data/logs', 'data/backups']) {
        await invoke('fs_mkdir', { path: this.baseDir + dir });
      }
    } catch (error) {
      this.lastError = String(error);
      logWarn('tauri-fs', 'could not create ' + this.baseDir + 'data: ' + this.lastError);
    }
  }

  private resolve(path: string): string {
    return this.baseDir + path;
  }

  async base(): Promise<string> {
    await this.ensure();
    return this.baseDir;
  }

  async describe(): Promise<string> {
    await this.ensure();
    return this.baseDir + (this.lastError ? ' (last error: ' + this.lastError + ')' : '');
  }

  async read(path: string): Promise<string | null> {
    await this.ensure();
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      return await invoke<string | null>('fs_read', { path: this.resolve(path) });
    } catch (error) {
      logWarn('tauri-fs', 'read failed for ' + path + ': ' + String(error));
      return null;
    }
  }

  async write(path: string, text: string): Promise<void> {
    await this.ensure();
    const { invoke } = await import('@tauri-apps/api/core');
    // The Rust side already does temp -> verify -> replace.
    await invoke('fs_write', { path: this.resolve(path), text });
  }

  async remove(path: string): Promise<void> {
    await this.ensure();
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('fs_remove', { path: this.resolve(path) });
    } catch (error) {
      logWarn('tauri-fs', 'remove failed for ' + path + ': ' + String(error));
    }
  }

  async list(prefix: string): Promise<string[]> {
    await this.ensure();
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      const names = await invoke<string[]>('fs_list', { dir: this.resolve(prefix) });
      return names.map((name) => prefix + name);
    } catch (error) {
      logWarn('tauri-fs', 'readDir failed for ' + prefix + ': ' + String(error));
      return [];
    }
  }
}

/** True when running inside the Tauri shell rather than a browser tab. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Picks the right backend for the current host. */
export function createStore(dataDir = ''): DataStore {
  // TauriFs is imported dynamically by its own methods, so constructing it here
  // is safe in a plain browser — but only use it where it will actually work.
  return new DataStore(isTauri() ? new TauriFs(dataDir) : new LocalStorageFs());
}

/**
 * Moves the data folder to another location (spec §17.5).
 *
 * Order matters: copy, verify the target, verify integrity, and only then clean
 * the source. If anything fails the source is left untouched and the caller gets
 * the list of failed paths.
 */
export const DATA_PATHS = [
  'data/settings.json',
  'data/history.json',
  'data/history.json.bak',
] as const;

export async function migrateStore(
  source: Fs,
  target: Fs,
  mapIds: readonly string[],
): Promise<{ copied: number; failed: string[] }> {
  const failed: string[] = [];
  const paths: string[] = [...DATA_PATHS, ...mapIds.map((id) => 'data/maps/' + id + '.json'),
                           ...mapIds.map((id) => 'data/maps/' + id + '.json.bak')];

  let copied = 0;
  for (const path of paths) {
    const text = await source.read(path);
    if (text === null) continue; // nothing there is not a failure
    try {
      await target.write(path, text);
      if ((await target.read(path)) !== text) throw new Error('verify failed');
      copied++;
    } catch {
      failed.push(path);
    }
  }

  // Only clean the source once every file is present and intact at the target.
  if (failed.length === 0) {
    for (const path of paths) {
      if ((await source.read(path)) === null) continue;
      if ((await target.read(path)) !== null) await source.remove(path);
    }
  }
  return { copied, failed };
}

/** Moves one store's contents into another (spec §17.5). */
export async function migrateStores(
  from: DataStore,
  to: DataStore,
): Promise<{ copied: number; failed: string[] }> {
  const mapIds = (await from.listMaps()).map((m) => m.mapId);
  return migrateStore(from.fs, to.fs, mapIds);
}
