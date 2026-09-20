/**
 * Data-layer tests (specs §17-§19). Runs against the in-memory backend, so the
 * safe-write, corruption-recovery and merge rules are all exercised deterministically.
 */

import { DataStore, MemoryFs, DEFAULT_SETTINGS, migrateStore, type HistoryRecord } from '../src/data/store.js';
import { newMapId, serializeBoard, UnsupportedFormatError } from '../src/core/serialize.js';
import { makeBoard, unitBanding } from '../src/core/board.js';
import { applyDirectHint, createSession } from '../src/core/session.js';

let failures = 0;
let checks = 0;

function check(condition: boolean, what: string): void {
  checks++;
  if (condition) return;
  failures++;
  console.log('  FAIL ' + what);
}

const shape = { width: 4, height: 4, colorCount: 2 };
const board = makeBoard(
  shape,
  Int32Array.from([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]),
  Int32Array.from([0, 10]),
  unitBanding(4),
  unitBanding(4),
);

function makeRecord(over: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    recordId: newMapId(),
    mapId: newMapId(),
    at: Date.now(),
    width: 10, height: 10, colorCount: 8, maxBand: 1,
    elapsedMs: 60_000,
    reveals: 0,
    checks: 8,
    success: true,
    hintsUsed: 0,
    directHintsUsed: 0,
    ...over,
  };
}

const prefs = { width: 10, height: 10, colorCount: 8, maxBand: 1 };

async function main(): Promise<void> {
  console.log('\n[设置：损坏走默认值并保留 .bad]');
  {
    const fs = new MemoryFs();
    await fs.write('data/settings.json', '{ not json');
    const store = new DataStore(fs);
    const settings = await store.loadSettings();
    check(settings.historyLimit === DEFAULT_SETTINGS.historyLimit, '损坏的设置应回退默认值');
    check((await fs.read('data/settings.json.bad')) !== null, '损坏原件应保留为 .bad');
  }

  console.log('\n[历史：.bak 恢复，失败则新建空历史]');
  {
    const fs = new MemoryFs();
    const store = new DataStore(fs);
    const good = [makeRecord()];
    await store.saveHistory(good);
    await fs.write('data/history.json.bak', JSON.stringify(good));
    await fs.write('data/history.json', '<<corrupt>>');
    const restored = await store.loadHistory();
    check(restored.length === 1, '应从 .bak 恢复，实际 ' + restored.length + ' 条');
    check((await fs.read('data/history.json.bad')) !== null, '损坏原件应保留');
  }
  {
    const store = new DataStore(new MemoryFs());
    await (store as unknown as { fs: MemoryFs }).fs.write('data/history.json', '<<corrupt>>');
    check((await store.loadHistory()).length === 0, '无可用备份时应返回空历史');
  }

  console.log('\n[历史：增删]');
  {
    const store = new DataStore(new MemoryFs());
    const a = makeRecord({ at: 1 });
    const b = makeRecord({ at: 2 });
    await store.appendRecord(a);
    await store.appendRecord(b);
    let all = await store.loadHistory();
    check(all.length === 2, '应写入 2 条');
    check(all[0].at === 2, '应按时间倒序');
    all = await store.deleteRecord(a.recordId);
    check(all.length === 1 && all[0].recordId === b.recordId, '应按 id 删除');
    await store.clearHistory();
    check((await store.loadHistory()).length === 0, '应能清空');
  }

  console.log('\n[最佳成绩：用时优先，其次检查次数]');
  {
    const fast = makeRecord({ elapsedMs: 30_000, checks: 20 });
    const slow = makeRecord({ elapsedMs: 90_000, checks: 2 });
    const tie = makeRecord({ elapsedMs: 30_000, checks: 5 });
    check(DataStore.bestFor([slow, fast, tie], prefs) === tie, '同用时下应选检查次数更少的');

    const cheated = makeRecord({ elapsedMs: 1_000, directHintsUsed: 1 });
    check(DataStore.bestFor([cheated, fast], prefs) === fast, '用过直接提示的应无资格');

    const hinted = makeRecord({ elapsedMs: 5_000, hintsUsed: 3 });
    check(DataStore.bestFor([hinted, fast], prefs) === hinted, '普通提示不应使分数无效');

    check(
      DataStore.bestFor([fast], { width: 6, height: 6, colorCount: 4, maxBand: 1 }) === null,
      '不同配置应分开记录',
    );
  }

  console.log('\n[地图库：保存 / 复制 / 重命名 / 删除]');
  {
    const store = new DataStore(new MemoryFs());
    const saved = await store.saveMap(serializeBoard(board), '第一张');
    check(saved.mapId.length > 0, '应分配地图 id');

    const copy = await store.duplicateMap(saved.mapId);
    check(copy !== null, '应能复制');
    check(copy!.mapId !== saved.mapId, '复制品必须获得新地图 id');
    check(copy!.board.mapId === copy!.mapId, '复制品的 JSON 内 id 也要同步');

    await store.renameMap(saved.mapId, '改名了');
    check((await store.getMap(saved.mapId))?.name === '改名了', '应能重命名');

    await store.deleteMap(saved.mapId);
    check((await store.getMap(saved.mapId)) === null, '应能删除');
    check((await store.listMaps()).length === 1, '删除后应只剩复制品');
  }

  console.log('\n[导入：按地图 id 去重，未知版本被拒]');
  {
    const store = new DataStore(new MemoryFs());
    const doc = serializeBoard(board);
    check((await store.importMap(doc, '导入一')) !== null, '首次导入应成功');
    check((await store.importMap(doc, '再来一次')) === null, '重复导入应按 id 跳过');

    let rejected = false;
    try {
      await store.importMap({ ...doc, formatVersion: 999 }, '未来版本');
    } catch (error) {
      rejected = error instanceof UnsupportedFormatError;
    }
    check(rejected, '未知 formatVersion 应被拒绝并给出版本提示');
  }

  console.log('\n[备份与恢复：合并、去重、默认不覆盖设置]');
  {
    const store = new DataStore(new MemoryFs());
    await store.saveSettings({ ...DEFAULT_SETTINGS, historyLimit: 42 });
    await store.appendRecord(makeRecord());
    await store.saveMap(serializeBoard(board), '备份图');

    const bundle = await store.createBackup();
    const other = new DataStore(new MemoryFs());
    await other.saveSettings({ ...DEFAULT_SETTINGS, historyLimit: 7 });

    const result = await other.restoreBackup(bundle, false);
    check(result.mapsAdded === 1 && result.recordsAdded === 1, '应各新增 1 条');
    check((await other.loadSettings()).historyLimit === 7, '默认不覆盖当前设置');

    const again = await other.restoreBackup(bundle, false);
    check(again.mapsSkipped === 1 && again.recordsSkipped === 1, '再次恢复应全部跳过');

    await other.restoreBackup(bundle, true);
    check((await other.loadSettings()).historyLimit === 42, '允许时才覆盖设置');
  }

  console.log('\n[直接提示：交出真实答案并记为无分数]');
  {
    const session = createSession(board, 0);
    const cell = applyDirectHint(session);
    check(cell !== null, '应返回一个格子');
    check(cell !== null && session.board.mines[session.board.colors[cell]] === cell, '给出的必须是真雷');
    check(session.directHintsUsed === 1, '应记录直接提示次数');
    check(session.hintsUsed === 0, '直接提示不应计入普通提示');
  }

  console.log('\n[恢复预览：只算不写]');
  {
    const store = new DataStore(new MemoryFs());
    const bundle = await store.createBackup();
    const preview = await store.previewRestore(bundle);
    check(preview.mapsAdded === 0 && preview.recordsAdded === 0, '空备份预览应为 0 新增');

    const other = new DataStore(new MemoryFs());
    const p2 = await other.previewRestore(bundle);
    check(p2.mapsAdded === 0, '无内容时预览不虚报');

    await other.restoreBackup(bundle, false);
    check((await other.listMaps()).length === 0, '预览阶段不应写入任何数据');
  }

  console.log('\n[迁移：先复制校验，再清理源；失败则保留源]');
  {
    const from = new MemoryFs();
    const to = new MemoryFs();
    const source = new DataStore(from);
    await source.saveSettings({ ...DEFAULT_SETTINGS, historyLimit: 33 });
    await source.appendRecord(makeRecord());
    const saved = await source.saveMap(serializeBoard(board), '迁移图');

    const result = await migrateStore(from, to, [saved.mapId]);
    check(result.failed.length === 0, '正常迁移不应有失败项');
    check(result.copied >= 3, '应复制设置/历史/地图，实际 ' + result.copied);

    const target = new DataStore(to);
    check((await target.loadSettings()).historyLimit === 33, '目标设置应一致');
    check((await target.loadHistory()).length === 1, '目标历史应一致');
    check((await target.getMap(saved.mapId)) !== null, '目标地图应一致');
    check((await from.read('data/settings.json')) === null, '验证通过后源应被清理');

    // A failing target must leave the source untouched.
    const from2 = new MemoryFs();
    const broken = new MemoryFs();
    const s2 = new DataStore(from2);
    await s2.saveSettings({ ...DEFAULT_SETTINGS, historyLimit: 5 });
    broken.failWrites = true;
    const failed = await migrateStore(from2, broken, []);
    check(failed.failed.length > 0, '写入失败应被记录');
    check((await from2.read('data/settings.json')) !== null, '失败时源数据必须完整保留');
  }

  console.log('\n' + (checks - failures) + '/' + checks + ' 通过');
  if (failures > 0) process.exit(1);
  console.log('全部通过');
}

void main();
