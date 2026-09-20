/**
 * Mass-production harness.
 *
 * This exists because the previous project's biggest mistake was building a UI
 * before knowing whether the generator could actually produce boards. Every
 * difficulty tier gets measured here — success rate, attempts, and wall time —
 * before anything else is written.
 *
 *   npm run mass                       # sweep the default tiers
 *   npm run mass -- --trials 1000
 *   npm run mass -- --only 8x8x6 --trials 1000
 */

import { generateBoard } from '../core/generator.js';
import type { BoardShape } from '../core/board.js';
import { TIERS, type Tier } from '../core/tiers.js';

function parseArgs(argv: string[]): {
  trials: number; only: Tier | null; maxAttempts: number; maxBand: number;
} {
  let trials = 200;
  let only: Tier | null = null;
  let maxAttempts = 200;
  let maxBand = 1;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--trials') trials = Number(argv[++i]);
    else if (argv[i] === '--max-attempts') maxAttempts = Number(argv[++i]);
    else if (argv[i] === '--max-band') maxBand = Number(argv[++i]);
    else if (argv[i] === '--only') {
      const [w, h, k] = argv[++i].split('x').map(Number);
      only = { id: 'custom', name: `${w}x${h}/${k}`, shape: { width: w, height: h, colorCount: k } };
    }
  }
  return { trials, only, maxAttempts, maxBand };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

function runTier(tier: Tier, trials: number, maxAttempts: number, maxBand: number): void {
  const shape: BoardShape = tier.shape;
  const times: number[] = [];
  const attempts: number[] = [];
  let success = 0;
  let nonUnique = 0;
  let stalled = 0;
  let budget = 0;
  let nodes = 0;
  let steps = 0;
  let hardSteps = 0;

  for (let i = 0; i < trials; i++) {
    const result = generateBoard({ shape, maxAttempts, maxBand, seed: 1 + i * 2654435761 });
    nodes += result.nodes;
    if (result.board) {
      success++;
      attempts.push(result.attempts);
      steps += result.steps;
      hardSteps += result.hardSteps;
    } else {
      if (result.failure === 'budget') budget++;
      if (result.rejectedNonUnique > result.rejectedStalled) nonUnique++;
      else stalled++;
    }
    times.push(result.elapsedMs);
  }

  times.sort((a, b) => a - b);
  attempts.sort((a, b) => a - b);

  const rate = (success / trials) * 100;
  const verdict = rate === 100 ? 'ok' : rate >= 90 ? 'warn' : 'FAIL';

  console.log(
    `${tier.name.padEnd(4)} ${String(tier.shape.width).padStart(2)}x${String(tier.shape.height).padEnd(2)} ` +
      `${String(tier.shape.colorCount).padStart(2)}雷  ` +
      `成功 ${rate.toFixed(1).padStart(5)}%  ` +
      `p50 ${String(percentile(times, 50)).padStart(4)}ms  ` +
      `p95 ${String(percentile(times, 95)).padStart(5)}ms  ` +
      `max ${String(times[times.length - 1]).padStart(6)}ms  ` +
      `尝试 avg ${(attempts.reduce((a, b) => a + b, 0) / (attempts.length || 1)).toFixed(1).padStart(5)} ` +
      `max ${String(attempts[attempts.length - 1] ?? 0).padStart(4)}  ` +
      `推理 ${(steps / (success || 1)).toFixed(0).padStart(3)}步` +
      `(难 ${(hardSteps / (success || 1)).toFixed(0)})  ` +
      `[不唯一 ${nonUnique} 停滞 ${stalled} 超预算 ${budget}]  ${verdict}`,
  );
}

const { trials, only, maxAttempts, maxBand } = parseArgs(process.argv.slice(2));
console.log(`\n每个档位 ${trials} 次，单次最多 ${maxAttempts} 次尝试，最大带宽 ${maxBand}\n`);
console.log('档位  尺寸    雷数   成功率     耗时                   采样次数              搜索节点   失败原因');

const tiers = only ? [only] : TIERS;
for (const tier of tiers) runTier(tier, trials, maxAttempts, maxBand);
console.log('');
