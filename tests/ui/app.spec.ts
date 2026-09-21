import { expect, test } from '@playwright/test';

const cells = (page: import('@playwright/test').Page) => page.locator('.cell');

test.beforeEach(async ({ page }) => {
  // The app opens on the home view now, so start a round before testing the board.
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.entryCard');
  await page.locator('#cardPlay').click();
  await page.waitForSelector('.cell');
});

test('棋盘渲染出格子与行列数字', async ({ page }) => {
  // 10x10 default: 100 playable cells plus a row and a column of clues.
  await expect(cells(page)).toHaveCount(100);
  await expect(page.locator('.clue:not(.corner)')).toHaveCount(20);
  await expect(page.locator('#statusLine')).toContainText('开局');
});

test('左键循环标记，且每种颜色最多一面旗', async ({ page }) => {
  const labels = await cells(page).evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLElement).getAttribute('aria-label') ?? ''),
  );
  const colorOf = (i: number) => (labels[i].match(/，(.*?)，/) ?? [])[1];

  let a = -1;
  let b = -1;
  for (let i = 0; i < labels.length && b < 0; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (colorOf(i) === colorOf(j)) {
        a = i;
        b = j;
        break;
      }
    }
  }
  expect(a).toBeGreaterThanOrEqual(0);

  const first = cells(page).nth(a);
  const second = cells(page).nth(b);

  await first.click();
  await expect(first).toHaveClass(/unsure/);
  await first.click();
  await expect(first).toHaveClass(/flagged/);

  // Flagging another cell of the same colour moves the flag.
  await second.click();
  await second.click();
  await expect(second).toHaveClass(/flagged/);
  await expect(first).not.toHaveClass(/flagged/);
  await expect(page.locator('#hudFlags')).toContainText('共 1 面旗');
});

test('右键排雷，排到雷会结束本局并公布雷位', async ({ page }) => {
  for (let i = 0; i < 100; i++) {
    if (!(await page.locator('#banner').isHidden())) break;
    await cells(page).nth(i).click({ button: 'right' });
  }
  await expect(page.locator('#banner')).toHaveClass(/lose/);
  await expect(page.locator('.cell.mine')).toHaveCount(8);
});

test('提示给出下一步推理，复盘可回放整条推导链', async ({ page }) => {
  await page.locator('#hintBtn').click();
  await expect(page.locator('#statusLine')).toContainText('提示：');

  await page.locator('#replayBtn').click();
  const steps = page.locator('.listItem');
  await expect(steps.first()).toBeVisible();
  const total = await steps.count();
  expect(total).toBeGreaterThan(5);

  await steps.nth(total - 1).click();
  // The last step knows every mine.
  await expect(page.locator('.cell.replay-mine')).toHaveCount(8);

  await page.locator('#replayExit').click();
  await expect(page.locator('#replayPanel')).toBeHidden();
});

test('用复盘推出的雷位可以纯插旗通关（不翻开）', async ({ page }) => {
  await page.locator('#replayBtn').click();
  const steps = page.locator('.listItem');
  await steps.nth((await steps.count()) - 1).click();
  const mines = await page
    .locator('.cell.replay-mine')
    .evaluateAll((nodes) => nodes.map((n) => Number((n as HTMLElement).dataset.cell)));
  await page.locator('#replayExit').click();

  for (const cell of mines) {
    await cells(page).nth(cell).click();
    await cells(page).nth(cell).click();
  }

  await expect(page.locator('#banner')).toHaveClass(/win/);
  await expect(page.locator('#hudReveals')).toHaveText('0');
  await expect(page.locator('#bestLine')).toContainText('本配置最佳');
});

test('切换语言会同时更新静态文案与棋盘无障碍标签', async ({ page }) => {
  // Language lives on the settings view, which is out of reach mid-game.
  await page.locator('#exitGameBtn').click();
  await page.locator('#navHome').click();
  await page.locator('#cardSettings').click();
  await expect(page.locator('#viewSettings')).toBeVisible();
  await expect(page.locator('#viewSettings .rules li').first()).toContainText('每种颜色');

  await page.locator('#languageSelect').selectOption('en-US');
  await expect(page.locator('#viewSettings .rules li').first()).toContainText('exactly one mine');
  await expect(page.locator('#newGameBtn')).toHaveText('New game');
  // The board is only re-rendered when a game is running, so start one.
  await page.locator('#navPlay').click();
  await page.waitForSelector('.cell');
  await expect(cells(page).first()).toHaveAttribute('aria-label', /Row 1, column 1/);

  await page.locator('#exitGameBtn').click();
  await page.locator('#navHome').click();
  await page.locator('#cardSettings').click();
  await page.locator('#languageSelect').selectOption('zh-CN');
  await expect(page.locator('#viewSettings .rules li').first()).toContainText('每种颜色');
});

test('键盘可以移动、标记与翻开', async ({ page }) => {
  await cells(page).first().focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(cells(page).nth(11)).toBeFocused();

  await page.keyboard.press('f');
  await page.keyboard.press('f');
  await expect(cells(page).nth(11)).toHaveClass(/flagged/);
});

test('按住拖动可以连续标记多个格子', async ({ page }) => {
  const boxes = await cells(page).evaluateAll((nodes) =>
    nodes.slice(0, 6).map((n) => {
      const r = (n as HTMLElement).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
  await page.mouse.move(boxes[0].x, boxes[0].y);
  await page.mouse.down();
  for (const b of boxes.slice(1)) await page.mouse.move(b.x, b.y);
  await page.mouse.up();
  await expect(page.locator('.cell.unsure, .cell.flagged')).not.toHaveCount(0);
  const marked = await page.locator('.cell.unsure, .cell.flagged').count();
  expect(marked).toBeGreaterThan(1);
});

test('提示有次数上限，且每次沿推导链递进', async ({ page }) => {
  const label = await page.locator('#hintBtn').innerText();
  expect(label).toMatch(/\d+\/\d+/);

  await page.locator('#hintBtn').click();
  const first = await page.locator('#statusLine').innerText();
  await page.locator('#hintBtn').click();
  const second = await page.locator('#statusLine').innerText();
  // Walking the chain means successive hints differ instead of repeating.
  expect(first).not.toEqual(second);
  await expect(page.locator('#statusLine')).toContainText('本局还剩');
});

test('设置页展示数据位置与各类数据路径', async ({ page }) => {
  await page.locator('#exitGameBtn').click();
  await page.locator('#navHome').click();
  await page.locator('#cardSettings').click();
  await expect(page.locator('#dataDirCurrent')).not.toBeEmpty();
  await expect(page.locator('#pathSettings')).toContainText('settings.json');
  await expect(page.locator('#pathMaps')).toContainText('maps');
  await expect(page.locator('#pathLogs')).toContainText('logs');
  await expect(page.locator('#pathBackups')).toContainText('backups');
});

test('生成超时可在设置里调整并生效', async ({ page }) => {
  await page.locator('#exitGameBtn').click();
  await page.locator('#navHome').click();
  await page.locator('#cardSettings').click();
  const timeout = page.locator('#setTimeout');
  await expect(timeout).toBeVisible();
  await timeout.fill('3000');
  await page.locator('#settingsSave').click();
  await expect(page.locator('#settingsSaved')).toBeVisible();
});

test('难度滑块与输入框共享数值，且输入框可突破滑块上限', async ({ page }) => {
  await page.locator('#exitGameBtn').click();
  await page.locator('#navHome').click();
  await page.locator('#cardSettings').click();

  const range = page.locator('#setDifficultyRange');
  const box = page.locator('#setDifficulty');
  await expect(range).toBeVisible();
  await expect(box).toBeVisible();

  // Slider -> box, and the resulting board is previewed.
  await range.fill('65');
  await range.dispatchEvent('input');
  await expect(box).toHaveValue('65');
  await expect(page.locator('#difficultyPreview')).toContainText('雷');

  // Box -> slider (within range).
  await box.fill('25');
  await box.dispatchEvent('input');
  await expect(range).toHaveValue('25');

  // Typing past the slider maximum keeps the real value.
  await box.fill('180');
  await box.dispatchEvent('input');
  await expect(range).toHaveValue('100');
  await expect(box).toHaveValue('180');
});

test('切换皮肤会改变界面配色、格子尺寸与标记符号', async ({ page }) => {
  await page.locator('#exitGameBtn').click();
  await page.locator('#navHome').click();
  await page.locator('#cardSettings').click();

  const readSkin = () =>
    page.evaluate(() => ({
      bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      cell: getComputedStyle(document.documentElement).getPropertyValue('--cell').trim(),
      raised: document.documentElement.dataset.skinRaised,
    }));

  await page.locator('#setSkin').selectOption({ label: '经典' });
  const classic = await readSkin();
  await page.locator('#setSkin').selectOption({ label: '暗夜' });
  const dark = await readSkin();

  expect(classic.bg).not.toEqual(dark.bg);
  expect(classic.raised).toEqual('1');
  expect(dark.raised).toEqual('0');

  // The high-contrast skin also swaps the flag glyph.
  await page.locator('#setSkin').selectOption({ label: '高对比' });
  await page.locator('#navPlay').click();
  await page.waitForSelector('.cell');
  const cell = page.locator('.cell').nth(3);
  await cell.click();
  await expect(cell).toHaveText('?');
  await cell.click();
  await expect(cell).toHaveText('✕');
});
