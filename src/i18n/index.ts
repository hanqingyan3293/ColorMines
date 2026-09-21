/**
 * i18n — started early on purpose.
 *
 * The previous project deferred this until the end and retrofitting it meant
 * touching 320 strings across two clients. Here the catalogue is small, so the
 * cost is close to zero and the habit stays cheap.
 *
 * Placeholders are `%1`, `%2`, … Static markup is translated through
 * `data-i18n` / `data-i18n-title`, so the HTML keeps readable Chinese defaults
 * and still renders before this module runs.
 */

export type Language = 'zh-CN' | 'en-US';
export type LanguageSetting = Language | 'auto';

const STORAGE_KEY = 'colormines.language';

const CATALOG: Record<string, { zh: string; en: string }> = {
  'app.title': { zh: 'Color Mines 颜色扫雷', en: 'Color Mines' },
  'app.tagline': { zh: '每种颜色恰好一个雷 · 行列数字是该行列雷的总数',
    en: 'One mine per colour · row and column numbers are their mine totals' },

  'tier.intro': { zh: '入门', en: 'Intro' },
  'tier.easy': { zh: '简单', en: 'Easy' },
  'tier.normal': { zh: '普通', en: 'Normal' },
  'tier.hard': { zh: '困难', en: 'Hard' },
  'tier.expert': { zh: '专家', en: 'Expert' },
  'tier.extreme': { zh: '极限', en: 'Extreme' },
  'tier.format': { zh: '%1 %2×%3 · %4 雷', en: '%1 %2×%3 · %4 mines' },

  'action.newGame': { zh: '新对局', en: 'New game' },
  'action.hint': { zh: '提示', en: 'Hint' },
  'action.hintCount': { zh: '提示 (%1)', en: 'Hint (%1)' },
  'action.replay': { zh: '复盘', en: 'Replay' },
  'action.exitReplay': { zh: '退出复盘', en: 'Exit replay' },
  'action.start': { zh: '开始', en: 'Start' },

  'panel.game': { zh: '对局', en: 'Game' },
  'panel.rules': { zh: '规则', en: 'Rules' },
  'panel.custom': { zh: '自定义', en: 'Custom' },
  'panel.language': { zh: '语言', en: 'Language' },

  'hud.time': { zh: '用时', en: 'Time' },
  'hud.flags': { zh: '标记', en: 'Flags' },
  'hud.reveals': { zh: '翻开', en: 'Reveals' },
  'hud.flagsValue': { zh: '%1 / %2 正确（共 %3 面旗）', en: '%1 / %2 correct (%3 flagged)' },

  'rule.one': { zh: '每种颜色在棋盘上<b>恰好有一个雷</b>。',
    en: 'Every colour has <b>exactly one mine</b> on the board.' },
  'rule.totals': { zh: '每行、每列旁边的数字是<b>该行/列雷的总数</b>。',
    en: 'The number beside each row and column is <b>its total number of mines</b>.' },
  'rule.reveal': { zh: '左键<b>翻开</b>格子 —— 这是<b>可选的风险</b>，翻到雷就输了。',
    en: 'Left click <b>reveals</b> — an <b>optional risk</b>; hitting a mine loses.' },
  'rule.dig': { zh: '<b>右键</b>排雷：这是<b>可选的风险</b>，排到雷就输了。',
    en: '<b>Right click</b> digs — an <b>optional risk</b>; hitting a mine loses.' },
  'rule.mark': { zh: '<b>左键</b>循环标记：未标记 → <code>?</code> → <b>旗</b>。',
    en: 'Right click cycles: unmarked → <code>?</code> → <b>flag</b>.' },
  'rule.oneFlag': { zh: '每种颜色<b>最多插一面旗</b>；全部插对即通关。',
    en: '<b>At most one flag per colour</b>; all correct wins.' },
  'rule.noReveal': { zh: '完全不翻开，纯靠推理也能赢。',
    en: 'You can win by deduction alone, without revealing anything.' },

  'custom.width': { zh: '宽', en: 'Width' },
  'custom.height': { zh: '高', en: 'Height' },
  'custom.mines': { zh: '雷（颜色数）', en: 'Mines (colours)' },
  'settings.minesHint': { zh: '难度主要由雷数决定。滑块范围 2-24，输入框可填入更大的值。',
    en: 'Difficulty is driven mostly by mine count. Slider spans 2-24; the box accepts more.' },
  'custom.band': { zh: '行列分组（1=逐行逐列）', en: 'Row/col grouping (1 = per line)' },
  'rule.band': { zh: '每组行/列旁边的数字是<b>该组雷的总数</b>（高难度下多行列会合并为一组）。',
    en: 'The number beside each row/column <b>group</b> is its total number of mines.' },

  'feasible.ok': { zh: '这个组合应该能顺利生成。', en: 'This combination should generate fine.' },
  'feasible.risky': { zh: '这个组合有点悬，生成可能变慢或失败。',
    en: 'This is on the edge — generation may be slow or fail.' },
  'feasible.unlikely': { zh: '这个组合很可能生成不出来（雷数 × 格数太大）。',
    en: 'This is unlikely to generate (mines × cells is too large).' },
  'feasible.tooManyColours': { zh: '颜色太多：每种颜色至少要占 2 格。',
    en: 'Too many colours: each colour needs at least 2 cells.' },

  'status.ready': { zh: '准备就绪', en: 'Ready' },
  'status.generating': { zh: '正在生成并验证棋盘…', en: 'Generating and verifying a board…' },
  'status.started': { zh: '开局：%1×%2 · %3 雷 · 生成耗时 %4ms',
    en: 'Started: %1×%2 · %3 mines · generated in %4ms' },
  'status.generateFailed': { zh: '这个组合生成不出来（试了很久）。建议换成 12×12 / 10 雷 这类已验证的组合。',
    en: 'This combination would not generate. Try a verified one such as 12×12 / 10 mines.' },
  'status.workerFailed': { zh: '生成器加载失败，请刷新页面。', en: 'The generator failed to load — please reload.' },
  'status.hint': { zh: '提示：%1', en: 'Hint: %1' },
  'status.noHint': { zh: '现在没有可提示的推理步骤了。', en: 'No further deduction to hint at.' },

  'hint.contradiction': { zh: '有旗子标错了位置 —— 先取消它们再试。',
    en: 'One of your flags is wrong — clear it and try again.' },
  'hint.singleton': { zh: '这种颜色只剩一个可能的位置', en: 'This colour has only one possible cell left' },
  'hint.rowBandDone': { zh: '第 %1 个行组的雷已经找齐，这组其他格子都安全',
    en: 'Row group %1 has all its mines; the rest of that group is safe' },
  'hint.colBandDone': { zh: '第 %1 个列组的雷已经找齐，这组其他格子都安全',
    en: 'Column group %1 has all its mines; the rest of that group is safe' },
  'hint.rowBandExact': { zh: '第 %1 个行组还差 %2 个雷，而只有 %2 种颜色能落在这一组',
    en: 'Row group %1 still needs %2 mines and only %2 colours can land in it' },
  'hint.colBandExact': { zh: '第 %1 个列组还差 %2 个雷，而只有 %2 种颜色能落在这一组',
    en: 'Column group %1 still needs %2 mines and only %2 colours can land in it' },
  'hint.rowBandExcluded': { zh: '第 %1 个行组已经排满，这种颜色的雷不在这一组',
    en: 'Row group %1 is full, so this colour\'s mine is not in it' },
  'hint.colBandExcluded': { zh: '第 %1 个列组已经排满，这种颜色的雷不在这一组',
    en: 'Column group %1 is full, so this colour\'s mine is not in it' },
  'hint.rowDone': { zh: '第 %1 行的雷已经找齐，这一行其他格子都安全',
    en: 'Row %1 has all its mines; the rest of that row is safe' },
  'hint.colDone': { zh: '第 %1 列的雷已经找齐，这一列其他格子都安全',
    en: 'Column %1 has all its mines; the rest of that column is safe' },
  'hint.rowExact': { zh: '第 %1 行还差 %2 个雷，而只有 %2 种颜色能落在这一行',
    en: 'Row %1 still needs %2 mines and only %2 colours can land in it' },
  'hint.colExact': { zh: '第 %1 列还差 %2 个雷，而只有 %2 种颜色能落在这一列',
    en: 'Column %1 still needs %2 mines and only %2 colours can land in it' },
  'hint.rowExcluded': { zh: '第 %1 行已经排满，这种颜色的雷不在这一行',
    en: 'Row %1 is full, so this colour\'s mine is not in it' },
  'hint.colExcluded': { zh: '第 %1 列已经排满，这种颜色的雷不在这一列',
    en: 'Column %1 is full, so this colour\'s mine is not in it' },

  'replay.title': { zh: '推理链复盘', en: 'Deduction replay' },
  'replay.rowN': { zh: '第 %1 行', en: 'row %1' },
  'replay.colN': { zh: '第 %1 列', en: 'column %1' },
  'replay.rowsN': { zh: '第 %1-%2 行', en: 'rows %1-%2' },
  'replay.colsN': { zh: '第 %1-%2 列', en: 'columns %1-%2' },
  'replay.someRow': { zh: '某一行', en: 'some row' },
  'replay.someCol': { zh: '某一列', en: 'some column' },
  'replay.singleton': { zh: '%1 只剩一个可能的位置：第 %2 行第 %3 列',
    en: '%1 has only one possible cell left: row %2, column %3' },
  'replay.excluded': { zh: '%1的%2已排除，该范围内其他格子都安全',
    en: '%2 is ruled out within %1; every other cell there is safe' },
  'replay.mustBeIn': { zh: '%1 的雷必须在%2内', en: '%1\'s mine must lie within %2' },
  'replay.notIn': { zh: '%1 的雷不在%2内', en: '%1\'s mine is not within %2' },
  'replay.hintIn': { zh: '%1 的雷位于%2范围内', en: '%1\'s mine lies within %2' },
  'status.hintLeft': { zh: '提示：%1（本局还剩 %2 次）', en: 'Hint: %1 (%2 left)' },
  'status.noHintsLeft': { zh: '本局的提示次数已用完（%1 次）。', en: 'No hints left for this round (%1 used).' },
  'replay.intro': { zh: '共 %1 步。点击任一步，看那一刻已知的信息。',
    en: '%1 steps. Click any step to see what was known at that point.' },
  'replay.step': { zh: '第 %1 / %2 步 · %3', en: 'Step %1 / %2 · %3' },

  'result.win': { zh: '通关！用时 %1 · 翻开 %2 次 · 提示 %3 次%4',
    en: 'Solved! %1 · %2 reveals · %3 hints%4' },
  'result.newRecord': { zh: '　<b>新纪录！</b>', en: '　<b>New record!</b>' },
  'result.lose': { zh: '踩到雷了。本局结束——下次可以不翻开，纯推理也能通关。',
    en: 'That was a mine. Round over — next time try winning without revealing anything.' },

  'score.none': { zh: '本配置还没有成绩记录。', en: 'No record for this configuration yet.' },
  'score.best': { zh: '本配置最佳：%1 · 翻开 %2 次 · 提示 %3 次',
    en: 'Best for this configuration: %1 · %2 reveals · %3 hints' },

  'cell.state.hidden': { zh: '未翻开', en: 'hidden' },
  'cell.state.revealed': { zh: '已翻开', en: 'revealed' },
  'cell.state.flagged': { zh: '已插旗', en: 'flagged' },
  'cell.state.unsure': { zh: '待定', en: 'unsure' },
  'cell.label': { zh: '第 %1 行 第 %2 列，%3，%4',
    en: 'Row %1, column %2, %3, %4' },
  'board.label': { zh: '棋盘', en: 'Board' },
  'clue.label': { zh: '%1 %2 个雷', en: '%1 has %2 mines' },
  'clue.row': { zh: '第 %1 行', en: 'Row %1' },
  'clue.col': { zh: '第 %1 列', en: 'Column %1' },


  'nav.home': { zh: '主页', en: 'Home' },
  'nav.play': { zh: '开始游戏', en: 'Play' },
  'nav.settings': { zh: '游戏设置', en: 'Settings' },
  'nav.history': { zh: '历史', en: 'History' },
  'nav.data': { zh: '导入导出', en: 'Import / export' },

  'action.directHint': { zh: '直接提示', en: 'Direct hint' },
  'action.exitGame': { zh: '返回菜单', en: 'Back to menu' },
  'action.apply': { zh: '应用并开始', en: 'Apply and start' },
  'action.saveSettings': { zh: '保存设置', en: 'Save settings' },
  'action.clearHistory': { zh: '清空历史', en: 'Clear history' },
  'action.saveCurrent': { zh: '保存当前地图', en: 'Save current map' },
  'action.exportMap': { zh: '导出地图', en: 'Export map' },
  'action.importMap': { zh: '导入地图', en: 'Import map' },
  'action.backup': { zh: '备份全部数据', en: 'Back up everything' },
  'action.restore': { zh: '恢复备份', en: 'Restore backup' },
  'action.open': { zh: '打开', en: 'Open' },
  'action.rename': { zh: '重命名', en: 'Rename' },
  'action.duplicate': { zh: '复制', en: 'Duplicate' },
  'action.delete': { zh: '删除', en: 'Delete' },
  'action.confirmRestore': { zh: '确认恢复', en: 'Confirm restore' },
  'action.cancel': { zh: '取消', en: 'Cancel' },

  'settings.board': { zh: '棋盘参数', en: 'Board' },
  'settings.app': { zh: '应用设置', en: 'Application' },
  'settings.historyLimit': { zh: '历史显示条数', en: 'History entries shown' },
  'settings.debug': { zh: '调试模式（显示雷位与求解信息）', en: 'Debug mode (reveal mines and solver info)' },
  'settings.saved': { zh: '已保存', en: 'Saved' },
  'settings.storage': { zh: '数据位置', en: 'Data location' },
  'settings.build': { zh: '构建时间', en: 'Built at' },
  'settings.timeout': { zh: '生成超时（毫秒）', en: 'Generation timeout (ms)' },
  'settings.skin': { zh: '皮肤', en: 'Skin' },
  'settings.skinHint': { zh: '皮肤只改外观，不影响规则与成绩。棋盘配色也会一起换。',
    en: 'Skins change appearance only - never the rules or scoring. Board colours change too.' },
  'settings.difficulty': { zh: '难度', en: 'Difficulty' },
  'settings.difficultyHint': { zh: '难度主要由雷数决定。滑块 0-100，输入框可填更大值突破上限。',
    en: 'Difficulty is driven by mine count. Slider 0-100; the box accepts more.' },
  'settings.difficultyPreview': { zh: '当前：%1×%2 · %3 雷%4',
    en: 'Current: %1x%2 · %3 mines%4' },
  'settings.difficultyGrouped': { zh: ' · 行列分组', en: ' · grouped' },
  'settings.dataDir': { zh: '数据位置', en: 'Data folder' },
  'data.kind.settings': { zh: '设置', en: 'Settings' },
  'data.kind.history': { zh: '历史', en: 'History' },
  'data.kind.maps': { zh: '地图', en: 'Maps' },
  'data.kind.logs': { zh: '日志', en: 'Logs' },
  'data.kind.backups': { zh: '备份', en: 'Backups' },
  'action.browse': { zh: '浏览…', en: 'Browse...' },
  'action.importSkin': { zh: '导入皮肤', en: 'Import skin' },
  'action.exportSkin': { zh: '导出当前皮肤', en: 'Export skin' },
  'status.skinImported': { zh: '已导入皮肤：%1', en: 'Imported skin: %1' },
  'status.skinExported': { zh: '已导出当前皮肤。', en: 'Exported the active skin.' },
  'status.skinRejected': { zh: '皮肤无效：%1', en: 'Skin rejected: %1' },
  'useDefault': { zh: '用默认位置', en: 'Use default' },
  'action.useDefault': { zh: '用默认位置', en: 'Use default' },
  'action.migrate': { zh: '迁移数据到此', en: 'Move data here' },
  'status.migrated': { zh: '迁移完成：复制 %1 个文件。', en: 'Migration done: %1 files copied.' },
  'status.migrateFailed': { zh: '迁移未完成，源数据保持原样。失败项：%1',
    en: 'Migration did not finish; source data untouched. Failed: %1' },
  'status.migrateNeedTarget': { zh: '请先用「浏览…」选择目标位置，再点迁移。',
    en: 'Pick a target folder with Browse first, then migrate.' },
  'status.pickUnsupported': { zh: '浏览器版本不支持选择文件夹，请直接输入路径或留空。',
    en: 'Folder picking needs the desktop build; type a path or leave it empty.' },
  'settings.dataDirHint': { zh: '留空则使用默认位置。保存后下次启动生效（桌面端）。',
    en: 'Leave empty for the default location. Applies after restart (desktop).' },
  'settings.timeoutHint': { zh: '超过这个时间还没找到唯一可推的棋盘就放弃，并提示换组合。',
    en: 'Give up after this long and suggest a different combination.' },
  'home.title': { zh: 'Color Mines', en: 'Color Mines' },
  'home.subtitle': { zh: '每种颜色恰好一个雷，靠推理找出它们。', en: 'One mine per colour - find them by deduction.' },
  'home.playDesc': { zh: '按当前配置开一局', en: 'Start a round with the current setup' },
  'home.settingsDesc': { zh: '尺寸、颜色、分组、超时等', en: 'Size, colours, grouping, timeout' },
  'home.historyDesc': { zh: '查看成绩与历史记录', en: 'Scores and past rounds' },
  'home.dataDesc': { zh: '地图库、导入导出、备份', en: 'Map library, import/export, backup' },
  'home.current': { zh: '当前配置', en: 'Current setup' },
  'home.mines': { zh: '雷', en: 'mines' },
  'home.perLine': { zh: '逐行逐列', en: 'per row/column' },
  'home.grouped': { zh: '行列分组（最多 %1）', en: 'grouped (up to %1)' },
  'status.timeout': { zh: '在这个时间内没能生成出棋盘（超时 %1ms）。试试降低雷数或尺寸，或调大生成超时。',
    en: 'No board found within %1ms. Try fewer mines or a smaller board, or raise the timeout.' },

  'debug.title': { zh: '调试', en: 'Debug' },
  'debug.showMines': { zh: '显示真实雷位', en: 'Show true mine positions' },
  'debug.map': { zh: '地图 %1', en: 'Map %1' },
  'debug.skin': { zh: '皮肤 %1', en: 'Skin %1' },
  'debug.size': { zh: '%1×%2 · %3 雷', en: '%1x%2 · %3 mines' },
  'debug.seed': { zh: '种子 %1', en: 'Seed %1' },
  'debug.bands': { zh: '行带 %1 / 列带 %2', en: 'Row bands %1 / col bands %2' },
  'debug.colors': { zh: '颜色 ID %1', en: 'Colour IDs %1' },
  'debug.solver': { zh: '求解器 %1 · 步骤 %2 · 已定位 %3', en: 'Solver %1 · steps %2 · placed %3' },
  'debug.solved': { zh: '可解', en: 'solved' },
  'debug.stalled': { zh: '停滞', en: 'stalled' },
  'debug.generation': { zh: '生成：尝试 %1 · 耗时 %2ms · 节点 %3 · 非唯一 %4 · 停滞 %5',
    en: 'Generation: attempts %1 · %2ms · nodes %3 · non-unique %4 · stalled %5' },
  'debug.failure': { zh: '生成失败诊断 %1', en: 'Generation failure %1' },

  'data.maps': { zh: '地图库', en: 'Map library' },
  'data.transfer': { zh: '导入 / 导出 / 备份', en: 'Import / export / backup' },
  'data.overwriteSettings': { zh: '恢复时覆盖当前设置', en: 'Overwrite current settings when restoring' },
  'data.empty': { zh: '还没有保存的地图。', en: 'No saved maps yet.' },
  'data.preview': { zh: '恢复预览', en: 'Restore preview' },
  'data.previewBody': { zh: '将新增地图 %1（跳过 %2）、新增记录 %3（跳过 %4）。确认后才会写入。',
    en: 'Will add %1 maps (%2 skipped) and %3 records (%4 skipped). Nothing is written until you confirm.' },
  'data.cancelled': { zh: '已取消恢复。', en: 'Restore cancelled.' },

  'history.empty': { zh: '还没有历史记录。', en: 'No history yet.' },
  'history.shown': { zh: '显示最近 %1 / %2 条', en: 'Showing latest %1 of %2' },
  'history.win': { zh: '通关', en: 'solved' },
  'history.lose': { zh: '失败', en: 'lost' },
  'history.noScore': { zh: '无分数', en: 'no score' },
  'history.entry': { zh: '%1 · %2×%3 · %4 雷 · %5 · 翻开 %6 次 · 提示 %7',
    en: '%1 · %2×%3 · %4 mines · %5 · %6 reveals · %7 hints' },

  'status.saved': { zh: '已保存地图：%1', en: 'Saved map: %1' },
  'status.exported': { zh: '已导出文件。', en: 'File exported.' },
  'status.imported': { zh: '已导入地图：%1', en: 'Imported map: %1' },
  'status.importSkipped': { zh: '这张地图已经在库中（地图 ID 相同），已跳过。',
    en: 'This map is already in the library (same map id); skipped.' },
  'status.backedUp': { zh: '已导出备份文件。', en: 'Backup exported.' },
  'status.backedUpTo': { zh: '已导出并存入数据文件夹：%1', en: 'Exported and saved in the data folder: %1' },
  'status.restored': { zh: '恢复完成：新增地图 %1（跳过 %2）、新增记录 %3（跳过 %4）。',
    en: 'Restore done: %1 maps added (%2 skipped), %3 records added (%4 skipped).' },
  'status.debugOnly': { zh: '调试功能仅在设置中开启后可用。', en: 'Debug features require enabling debug mode in settings.' },

  'result.noScore': { zh: '（用过直接提示，本局不计分）', en: '(direct hint used — no score)' },
  'language.auto': { zh: '跟随系统', en: 'Follow system' },
  'language.zh': { zh: '简体中文', en: '简体中文' },
  'language.en': { zh: 'English', en: 'English' },
};

let current: Language = 'zh-CN';
let setting: LanguageSetting = 'auto';

export function resolveLanguage(value: LanguageSetting): Language {
  if (value !== 'auto') return value;
  if (typeof navigator === 'undefined') return 'zh-CN';
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

export function configuredLanguage(): LanguageSetting {
  return setting;
}

export function language(): Language {
  return current;
}

export function setLanguage(value: LanguageSetting): void {
  setting = value;
  current = resolveLanguage(value);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* storage unavailable — the session still works, just without persistence */
  }
  if (typeof document !== 'undefined') {
    applyStaticTranslations(document);
    document.documentElement.lang = current;
    document.dispatchEvent(new CustomEvent('colormines:languagechange'));
  }
}

export function initI18n(): Language {
  let stored: LanguageSetting = 'auto';
  try {
    if (typeof localStorage !== 'undefined') {
      const value = localStorage.getItem(STORAGE_KEY);
      if (value === 'auto' || value === 'zh-CN' || value === 'en-US') stored = value;
    }
  } catch {
    /* ignore */
  }
  setLanguage(stored);
  return current;
}

export function t(key: string, ...args: Array<string | number>): string {
  const entry = CATALOG[key];
  if (!entry) return key;
  const raw = current === 'zh-CN' ? entry.zh : entry.en;
  if (!args.length) return raw;
  return raw.replace(/%(\d)/g, (_, index: string) => {
    const value = args[Number(index) - 1];
    return value === undefined ? `%${index}` : String(value);
  });
}

export function applyStaticTranslations(root: ParentNode): void {
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-i18n]'))) {
    const key = node.dataset.i18n;
    if (key) node.innerHTML = t(key);
  }
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-i18n-title]'))) {
    const key = node.dataset.i18nTitle;
    if (key) node.title = t(key);
  }
}

export const catalog = CATALOG;
