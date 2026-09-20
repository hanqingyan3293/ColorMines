/**
 * Generation worker.
 *
 * Generation runs in the background for one reason: the tail of the distribution
 * matters. Median generation is ~20ms, but a user who picks an ambitious custom
 * size can hit seconds of search, and blocking the main thread there would look
 * like a crash.
 */

import { generateBoard } from '../core/generator.js';
import { serializeBoard, type SerializedBoard } from '../core/serialize.js';
import type { BoardShape } from '../core/board.js';

export interface GenerateRequest {
  shape: BoardShape;
  maxAttempts: number;
  seed: number;
  /** 1 = per row/column, 2..3 = grouped rows/columns (harder). */
  maxBand: number;
  /** Wall-clock budget, from settings. */
  timeoutMs: number;
}

export interface GenerateResponse {
  board: SerializedBoard | null;
  elapsedMs: number;
  attempts: number;
  steps: number;
  /** Diagnostics for debug mode (spec §29). */
  seed: number;
  nodes: number;
  rejectedNonUnique: number;
  rejectedStalled: number;
  failure?: string;
}

self.onmessage = (event: MessageEvent<GenerateRequest>): void => {
  const { shape, maxAttempts, seed, maxBand, timeoutMs } = event.data;
  const result = generateBoard({ shape, maxAttempts, seed, maxBand, timeoutMs });
  const response: GenerateResponse = {
    board: result.board ? serializeBoard(result.board) : null,
    elapsedMs: result.elapsedMs,
    attempts: result.attempts,
    steps: result.steps,
    seed: result.seed,
    nodes: result.nodes,
    rejectedNonUnique: result.rejectedNonUnique,
    rejectedStalled: result.rejectedStalled,
    failure: result.failure,
  };
  self.postMessage(response);
};
