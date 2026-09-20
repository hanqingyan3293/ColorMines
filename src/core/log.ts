/**
 * Rolling log plus an "abnormal exit" flag (spec §30).
 *
 * Default level is warning; debug adds solver and generation diagnostics and is
 * only enabled explicitly — never reachable through the normal UI in a release.
 */

export type Level = 'error' | 'warn' | 'info' | 'debug';

const ORDER: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export interface LogEntry {
  at: number;
  level: Level;
  scope: string;
  message: string;
}

const MAX_ENTRIES = 500;
const RING_KEY = 'colormines.log-ring';
const FLAG_KEY = 'colormines.abnormal-exit';

const entries: LogEntry[] = [];
let debug = false;
/** Optional sink (wired to the data folder on the desktop) for durable logs. */
let sink: ((line: string) => void) | null = null;

export function setLogSink(fn: ((line: string) => void) | null): void {
  sink = fn;
}

function line(entry: LogEntry): string {
  return '[' + new Date(entry.at).toISOString() + '][' + entry.level + '] '
    + entry.scope + ': ' + entry.message;
}

export function setDebug(enabled: boolean): void {
  debug = enabled;
}

export function isDebug(): boolean {
  return debug;
}

export function log(level: Level, scope: string, message: string): void {
  if (ORDER[level] > ORDER.warn && !debug) return;
  const entry: LogEntry = { at: Date.now(), level, scope, message };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);

  if (level === 'error' || level === 'warn') {
    try {
      localStorage.setItem(RING_KEY, JSON.stringify(entries.slice(-50)));
    } catch {
      /* storage unavailable — logging must never break the game */
    }
    sink?.(line(entry));
  }
  if (debug) {
    const stamp = new Date(entry.at).toISOString();
    const line = '[' + stamp + '][' + level + '] ' + scope + ': ' + message;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
}

export const logError = (scope: string, message: string): void => log('error', scope, message);
export const logWarn = (scope: string, message: string): void => log('warn', scope, message);
export const logInfo = (scope: string, message: string): void => log('info', scope, message);
export const logDebug = (scope: string, message: string): void => log('debug', scope, message);

export function recent(): readonly LogEntry[] {
  return entries;
}

/** True when the previous run did not shut down cleanly. */
export function clearAbnormalExit(): boolean {
  try {
    const flag = localStorage.getItem(FLAG_KEY);
    if (flag) {
      localStorage.removeItem(FLAG_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function markRunning(): void {
  try {
    localStorage.setItem(FLAG_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function markCleanExit(): void {
  try {
    localStorage.removeItem(FLAG_KEY);
  } catch {
    /* ignore */
  }
}
