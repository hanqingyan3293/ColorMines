/**
 * Plain-object form of a board (spec §16).
 *
 * Typed arrays survive structured clone, but plain arrays survive *everything*
 * — JSON, localStorage, a Tauri IPC call. One representation, no special cases.
 *
 * `formatVersion` is the only schema/version identifier used. A saved map may
 * legitimately contain the true mine positions: the game is local/offline and
 * the map is the user's own data. The app never exposes that during play, but
 * the user is free to inspect and edit their own JSON.
 */

import { makeBoard, type Board, type BoardShape } from './board.js';

/** Bump only for breaking changes; readers must reject anything they don't know. */
export const FORMAT_VERSION = 1;

export interface SerializedBoard {
  formatVersion: number;
  /** UUID v4. Stable for a map; a copy gets a fresh one. */
  mapId: string;
  width: number;
  height: number;
  colorCount: number;
  colors: number[];
  mines: number[];
  rowCounts: number[];
  colCounts: number[];
  rowBandOf: number[];
  colBandOf: number[];
}

/** RFC 4122 v4, using the platform CSPRNG when available. */
export function newMapId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function serializeBoard(board: Board, mapId?: string): SerializedBoard {
  return {
    formatVersion: FORMAT_VERSION,
    mapId: mapId ?? newMapId(),
    width: board.width,
    height: board.height,
    colorCount: board.colorCount,
    colors: Array.from(board.colors),
    mines: Array.from(board.mines),
    rowCounts: Array.from(board.rowCounts),
    colCounts: Array.from(board.colCounts),
    rowBandOf: Array.from(board.rowBandOf),
    colBandOf: Array.from(board.colBandOf),
  };
}

export class UnsupportedFormatError extends Error {
  constructor(public readonly found: unknown) {
    super(
      `不支持的地图格式版本：${String(found)}（本应用支持第 ${FORMAT_VERSION} 版）。` +
        `请更新应用，或导出为兼容版本。`,
    );
    this.name = 'UnsupportedFormatError';
  }
}

/**
 * Reads a map document. Unknown *fields* are ignored when the rest is valid;
 * an unknown `formatVersion` is rejected with a clear message (spec §16.3).
 */
export function deserializeBoard(data: SerializedBoard): Board {
  if (!data || typeof data !== 'object') throw new Error('地图文件不是有效的 JSON 对象');
  if (data.formatVersion !== FORMAT_VERSION) throw new UnsupportedFormatError(data.formatVersion);

  const shape: BoardShape = {
    width: data.width,
    height: data.height,
    colorCount: data.colorCount,
  };
  return makeBoard(
    shape,
    Int32Array.from(data.colors),
    Int32Array.from(data.mines),
    Int32Array.from(data.rowBandOf),
    Int32Array.from(data.colBandOf),
  );
}
