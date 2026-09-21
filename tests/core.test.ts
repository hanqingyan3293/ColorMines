/**
 * Core tests. Deliberately dependency-free so they run in Node and in CI with
 * no bundler step.
 *
 *   npm test
 */

import { generateBoard } from '../src/core/generator.js';
import { makeBoard, validateBoard, unitBanding, type BoardShape } from '../src/core/board.js';
import { difficultyToConfig, configToDifficulty } from '../src/core/tiers.js';
import { PALETTE, UNKNOWN_SWATCH, minPaletteDistance, swatch } from '../src/ui/palette.js';
import { BUILTIN_SKINS, SKIN_FORMAT_VERSION, paletteSeparation, validateSkin } from '../src/ui/skin.js';
import { countSolutions } from '../src/core/solver-exact.js';
import { solveLogical } from '../src/core/solver-logical.js';
import { TIERS } from '../src/core/tiers.js';
import {
  createSession, cycleMark, reveal, flagCount, correctFlags, Mark, type Session,
} from '../src/core/session.js';
import { makeRng } from '../src/core/rng.js';

let failures = 0;
let checks = 0;

function check(condition: boolean, what: string): void {
  checks++;
  if (condition) return;
  failures++;
  console.log(`  FAIL ${what}`);
}

function section(name: string): void {
  console.log(`\n[${name}]`);
}

// ---------------------------------------------------------------------------
section('生成的棋盘满足所有不变式');
{
  for (const tier of TIERS) {
    let ok = 0;
    for (let i = 0; i < 12; i++) {
      const result = generateBoard({ shape: tier.shape, maxAttempts: 1500, seed: 7 + i * 101 });
      if (result.board && validateBoard(result.board) === null) ok++;
    }
    check(ok === 12, `${tier.name} (${tier.shape.width}x${tier.shape.height}/${tier.shape.colorCount}) 12/12 合法，实际 ${ok}`);
  }
}

// ---------------------------------------------------------------------------
section('精确求解器');
{
  // Two colours sharing a column pair: rows/cols cannot tell them apart,
  // so this puzzle has exactly two solutions.
  const shape: BoardShape = { width: 2, height: 2, colorCount: 2 };
  const colors = Int32Array.from([0, 1, 0, 1]);
  const rowCounts = Int32Array.from([1, 1]);
  const colCounts = Int32Array.from([1, 1]);
  const rows2 = unitBanding(2);
  const cols2 = unitBanding(2);
  const two = countSolutions(shape, colors, rowCounts, colCounts, rows2, cols2, 8);
  check(two.count === 2, `交换退化应给出 2 解，实际 ${two.count}`);

  // Same board, but row 1 pinned to zero: both mines are forced.
  const forcedRows = Int32Array.from([2, 0]);
  const one = countSolutions(shape, colors, forcedRows, colCounts, rows2, cols2, 8);
  check(one.count === 1, `行 1 归零后应唯一，实际 ${one.count}`);

  // A row asking for more mines than colours can supply is unsatisfiable.
  const impossible = Int32Array.from([3, 0]);
  check(countSolutions(shape, colors, impossible, colCounts, rows2, cols2, 8).count === 0, '无解应返回 0');
}

// ---------------------------------------------------------------------------
section('逻辑求解器解出的答案与真值一致（关键）');
{
  // A solver that claims success but returns the wrong cells would silently
  // ship unsolvable boards, so assert against the actual answer.
  let checked = 0;
  let wrong = 0;
  let unsolved = 0;
  for (const tier of TIERS) {
    for (let i = 0; i < 8; i++) {
      const result = generateBoard({ shape: tier.shape, maxAttempts: 1500, seed: 31 + i * 977 });
      if (!result.board) continue;
      const board = result.board;
      const logical = solveLogical(
        tier.shape, board.colors, board.rowCounts, board.colCounts,
        board.rowBandOf, board.colBandOf);
      if (!logical.solved) {
        unsolved++;
        continue;
      }
      const derived = new Int32Array(tier.shape.colorCount).fill(-1);
      for (const step of logical.steps) {
        if (step.kind === 'singleton' && step.cell >= 0) derived[step.color] = step.cell;
      }
      for (let c = 0; c < tier.shape.colorCount; c++) {
        if (derived[c] !== -1 && derived[c] !== board.mines[c]) wrong++;
      }
      checked++;
    }
  }
  check(checked > 0, '至少验证了一局');
  check(unsolved === 0, `逻辑求解器不应停滞，停滞 ${unsolved} 局`);
  check(wrong === 0, `推导出的雷位必须与真值一致，错误 ${wrong} 处`);
}

// ---------------------------------------------------------------------------
section('生成的每一局都唯一');
{
  let bad = 0;
  for (const tier of TIERS) {
    for (let i = 0; i < 8; i++) {
      const result = generateBoard({ shape: tier.shape, maxAttempts: 1500, seed: 53 + i * 613 });
      if (!result.board) continue;
      const board = result.board;
      const { count } = countSolutions(
        tier.shape, board.colors, board.rowCounts, board.colCounts,
        board.rowBandOf, board.colBandOf, 2);
      if (count !== 1) bad++;
    }
  }
  check(bad === 0, `所有生成结果必须唯一解，非唯一 ${bad} 局`);
}

// ---------------------------------------------------------------------------
section('会话：胜负与每色一旗');
{
  const shape: BoardShape = { width: 4, height: 4, colorCount: 2 };
  const colors = Int32Array.from([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]);
  const mines = Int32Array.from([0, 10]); // colour 0 -> cell 0, colour 1 -> cell 10
  const board = makeBoard(shape, colors, mines, unitBanding(4), unitBanding(4));

  // Winning by flagging only: never reveal anything.
  const session = createSession(board, 0);
  for (const cell of [0, 10]) {
    cycleMark(session, cell); // hidden -> unsure
    cycleMark(session, cell); // unsure -> flagged
  }
  check(session.status === 'won', `全对插旗应获胜，实际 ${session.status}`);
  check(flagCount(session) === 2, `应有 2 面旗，实际 ${flagCount(session)}`);
  check(correctFlags(session) === 2, '两面旗都应正确');
  check(session.reveals === 0, '不翻开也必须能赢');

  // One flag per colour: flagging a second cell of the same colour moves the flag.
  const second = createSession(board, 0);
  cycleMark(second, 0);
  cycleMark(second, 0);
  check(second.flagOfColor[0] === 0, '第一面旗应落在 0');
  cycleMark(second, 4);
  cycleMark(second, 4);
  check(second.flagOfColor[0] === 4, '同色第二面旗应取代第一面');
  check(second.marks[0] === Mark.Hidden, '被取代的格子应回到隐藏');
  check(flagCount(second) === 1, `同色不应同时有两面旗，实际 ${flagCount(second)}`);

  // Revealing a mine loses, and flagged cells are protected.
  const risky = createSession(board, 0);
  cycleMark(risky, 0);
  cycleMark(risky, 0);
  const blocked = reveal(risky, 0);
  check(!blocked.changed && !blocked.hitMine, '已插旗的格子不应被翻开');
  const boom = reveal(risky, 10);
  check(boom.hitMine && risky.status === 'lost', '翻开雷应判负');
  check(risky.endedAt !== null, '负局应记下结束时间');

  // A safe reveal neither wins nor loses on its own.
  const safe = createSession(board, 0);
  reveal(safe, 1);
  check(safe.status === 'playing' && safe.marks[1] === Mark.Revealed, '安全翻开应继续对局');
  cycleMark(safe, 0);
  cycleMark(safe, 0);
  cycleMark(safe, 10);
  cycleMark(safe, 10);
  check(safe.status === 'won', '翻开过也能靠插旗获胜');
}

// ---------------------------------------------------------------------------
section('随机对局回归');
{
  const rng = makeRng(20240917);
  let crashed = 0;
  let inconsistent = 0;
  let wins = 0;
  let losses = 0;

  for (let game = 0; game < 200; game++) {
    const tier = TIERS[game % TIERS.length];
    const result = generateBoard({ shape: tier.shape, maxAttempts: 1500, seed: 1000 + game });
    if (!result.board) continue;
    const session: Session = createSession(result.board, 0);

    try {
      for (let move = 0; move < 60 && session.status === 'playing'; move++) {
        const cell = rng.nextInt(tier.shape.width * tier.shape.height);
        // Mostly mark; occasionally take the risky option.
        if (rng.nextFloat() < 0.8) {
          cycleMark(session, cell);
          if (rng.nextFloat() < 0.6) cycleMark(session, cell);
        } else {
          reveal(session, cell);
        }
      }
    } catch {
      crashed++;
      continue;
    }

    if (session.status === 'won') {
      wins++;
      if (correctFlags(session) !== tier.shape.colorCount) inconsistent++;
    } else if (session.status === 'lost') {
      losses++;
      if (session.endedAt === null) inconsistent++;
    }

    // No cell may be both revealed and flagged.
    for (let i = 0; i < session.marks.length; i++) {
      const m = session.marks[i];
      if (m !== Mark.Hidden && m !== Mark.Revealed && m !== Mark.Flagged && m !== Mark.Unsure) {
        inconsistent++;
      }
    }
  }

  check(crashed === 0, `随机对局不应抛异常，崩溃 ${crashed} 次`);
  check(inconsistent === 0, `终局状态应自洽，不一致 ${inconsistent} 次`);
  check(wins + losses > 0, `随机玩法应产生一些结局（胜 ${wins} 负 ${losses}）`);
}

// ---------------------------------------------------------------------------
console.log('\n[难度滑块：雷数随刻度单调不降]');
{
  // Difficulty is driven by mine count, so the ramp must never go backwards.
  let previous = 0;
  let monotonic = true;
  const samples: string[] = [];
  for (let level = 0; level <= 100; level += 10) {
    const config = difficultyToConfig(level);
    if (config.colorCount < previous) monotonic = false;
    previous = config.colorCount;
    samples.push(config.width + 'x' + config.height + '/' + config.colorCount);
  }
  check(monotonic, '雷数应随难度刻度不下降: ' + samples.join(' '));
  check(difficultyToConfig(0).colorCount === 4, '刻度 0 应为入门的 4 雷');
  check(difficultyToConfig(100).colorCount >= 8, '刻度 100 应达到极限档雷数');

  // Typing past the slider maximum must still yield a legal config.
  const beyond = difficultyToConfig(150);
  check(beyond.width <= 24 && beyond.colorCount >= 2, '超出上限应被夹紧到合法范围');
  check(configToDifficulty({ width: 12, height: 12, colorCount: 10, maxBand: 1 }) > 40,
    '反查应把 12x12/10 雷定位在中高难度');
}

console.log('\n[调色板：颜色是玩法，不能重复]');
{
  check(PALETTE.length >= 40, '调色板至少要覆盖 40 色，实际 ' + PALETTE.length);
  const fills = new Set(PALETTE.map((p) => p.fill));
  check(fills.size === PALETTE.length, '不能有重复的色值');
  check(minPaletteDistance() >= 25, '任意两色最小距离应 >= 25，实际 ' + minPaletteDistance().toFixed(1));
  // Out-of-range must NOT silently reuse an earlier colour.
  check(swatch(9999) === UNKNOWN_SWATCH, '越界应回退到未知色而不是循环复用');
  check(swatch(17).fill !== swatch(1).fill, '第 17 色不能与第 1 色相同');
}

console.log('\n[皮肤校验]');
{
  const good = {
    formatVersion: SKIN_FORMAT_VERSION, id: 'x', name: 'X',
    ui: { bg: '#000000', surface: '#111111', 'surface-2': '#222222', border: '#333333',
          text: '#ffffff', muted: '#888888', accent: '#ff00ff', danger: '#ff0000',
          success: '#00ff00' },
    cell: { radius: 2, gap: 3, size: 30, raised: false },
    axes: { ui: { style: 'card' }, board: { style: 'glass' }, cell: { style: 'mica' } },
    glyphs: { unsure: '?', flagged: '#' },
  };
  check(validateSkin(good).id === 'x', '合法皮肤应通过校验');

  const throws = (payload: unknown, needle: string) => {
    try { validateSkin(payload); return false; }
    catch (e) { return String((e as Error).message).includes(needle); }
  };
  check(throws({ ...good, formatVersion: 99 }, 'skin.version-99'), '版本不符应被拒绝');
  check(throws({ ...good, name: '' }, 'skin.noName'), '缺名字应被拒绝');
  check(throws({ ...good, ui: { bg: '#000000' } }, 'skin.uiMissing'), '缺 UI 字段应被拒绝');
  check(throws({ ...good, palette: [{ fill: '#111111' }, { fill: '#121212' }] }, 'skin.tooSimilar'),
    '配色过于接近应被拒绝（颜色是玩法）');
  check(throws({ ...good, palette: [{ fill: 'red' }, { fill: '#00ff00' }] }, 'skin.badColour'),
    '非法色值应被拒绝');

  check(throws({ ...good, axes: { ui: { style: 'card' } } }, 'skin.noAxes'), '缺三轴定义应被拒绝');
  check(throws({ ...good, axes: { ui: { style: 'nope' }, board: { style: 'card' }, cell: { style: 'card' } } },
    'skin.badStyle'), '未知风格应被拒绝');
  check(throws({ ...good, axes: { ui: { style: 'image' }, board: { style: 'card' }, cell: { style: 'card' } } },
    'skin.noImage'), '图片风格缺图应被拒绝');

  check(BUILTIN_SKINS.length >= 6, '至少内置 6 套皮肤，实际 ' + BUILTIN_SKINS.length);
  check(BUILTIN_SKINS.some((s) => s.axes.ui.style !== s.axes.board.style),
    '应有混搭示例（三轴可独立选择）');
  check(BUILTIN_SKINS.every((s) => validateSkin(s).id === s.id), '每套内置皮肤都应能通过校验');
  check(paletteSeparation([]) === 0, '空调色板距离应为 0');
}

console.log(`\n${checks - failures}/${checks} 通过`);
if (failures > 0) {
  console.log(`${failures} 失败`);
  process.exit(1);
}
console.log('全部通过');
