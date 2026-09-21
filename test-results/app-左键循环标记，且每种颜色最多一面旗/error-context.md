# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: app.spec.ts >> 左键循环标记，且每种颜色最多一面旗
- Location: tests\ui\app.spec.ts:22:1

# Error details

```
Error: expect(locator).not.toHaveClass(expected) failed

Locator: locator('.cell').first()
Expected pattern: not /flagged/
Received string: "cell flagged"
Timeout: 5000ms

Call log:
  - Expect "not toHaveClass" locator('.cell').first() with timeout 5000ms
  - waiting for locator('.cell').first()
    14 × locator resolved to <button type="button" data-cell="0" class="cell flagged" aria-label="第 1 行 第 1 列，深橙红，已插旗">⚑</button>
       - unexpected value "cell flagged"

```

```yaml
- button "第 1 行 第 1 列，深橙红，已插旗": ⚑
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | 
  3   | const cells = (page: import('@playwright/test').Page) => page.locator('.cell');
  4   | 
  5   | test.beforeEach(async ({ page }) => {
  6   |   // The app opens on the home view now, so start a round before testing the board.
  7   |   await page.goto('/');
  8   |   await page.evaluate(() => localStorage.clear());
  9   |   await page.reload();
  10  |   await page.waitForSelector('.entryCard');
  11  |   await page.locator('#cardPlay').click();
  12  |   await page.waitForSelector('.cell');
  13  | });
  14  | 
  15  | test('棋盘渲染出格子与行列数字', async ({ page }) => {
  16  |   // 10x10 default: 100 playable cells plus a row and a column of clues.
  17  |   await expect(cells(page)).toHaveCount(100);
  18  |   await expect(page.locator('.clue:not(.corner)')).toHaveCount(20);
  19  |   await expect(page.locator('#statusLine')).toContainText('开局');
  20  | });
  21  | 
  22  | test('左键循环标记，且每种颜色最多一面旗', async ({ page }) => {
  23  |   const labels = await cells(page).evaluateAll((nodes) =>
  24  |     nodes.map((n) => (n as HTMLElement).getAttribute('aria-label') ?? ''),
  25  |   );
  26  |   const colorOf = (i: number) => (labels[i].match(/，(.*?)，/) ?? [])[1];
  27  | 
  28  |   let a = -1;
  29  |   let b = -1;
  30  |   for (let i = 0; i < labels.length && b < 0; i++) {
  31  |     for (let j = i + 1; j < labels.length; j++) {
  32  |       if (colorOf(i) === colorOf(j)) {
  33  |         a = i;
  34  |         b = j;
  35  |         break;
  36  |       }
  37  |     }
  38  |   }
  39  |   expect(a).toBeGreaterThanOrEqual(0);
  40  | 
  41  |   const first = cells(page).nth(a);
  42  |   const second = cells(page).nth(b);
  43  | 
  44  |   await first.click();
  45  |   await expect(first).toHaveClass(/unsure/);
  46  |   await first.click();
  47  |   await expect(first).toHaveClass(/flagged/);
  48  | 
  49  |   // Flagging another cell of the same colour moves the flag.
  50  |   await second.click();
  51  |   await second.click();
  52  |   await expect(second).toHaveClass(/flagged/);
> 53  |   await expect(first).not.toHaveClass(/flagged/);
      |                           ^ Error: expect(locator).not.toHaveClass(expected) failed
  54  |   await expect(page.locator('#hudFlags')).toContainText('共 1 面旗');
  55  | });
  56  | 
  57  | test('右键排雷，排到雷会结束本局并公布雷位', async ({ page }) => {
  58  |   for (let i = 0; i < 100; i++) {
  59  |     if (!(await page.locator('#banner').isHidden())) break;
  60  |     await cells(page).nth(i).click({ button: 'right' });
  61  |   }
  62  |   await expect(page.locator('#banner')).toHaveClass(/lose/);
  63  |   await expect(page.locator('.cell.mine')).toHaveCount(8);
  64  | });
  65  | 
  66  | test('提示给出下一步推理，复盘可回放整条推导链', async ({ page }) => {
  67  |   await page.locator('#hintBtn').click();
  68  |   await expect(page.locator('#statusLine')).toContainText('提示：');
  69  | 
  70  |   await page.locator('#replayBtn').click();
  71  |   const steps = page.locator('.listItem');
  72  |   await expect(steps.first()).toBeVisible();
  73  |   const total = await steps.count();
  74  |   expect(total).toBeGreaterThan(5);
  75  | 
  76  |   await steps.nth(total - 1).click();
  77  |   // The last step knows every mine.
  78  |   await expect(page.locator('.cell.replay-mine')).toHaveCount(8);
  79  | 
  80  |   await page.locator('#replayExit').click();
  81  |   await expect(page.locator('#replayPanel')).toBeHidden();
  82  | });
  83  | 
  84  | test('用复盘推出的雷位可以纯插旗通关（不翻开）', async ({ page }) => {
  85  |   await page.locator('#replayBtn').click();
  86  |   const steps = page.locator('.listItem');
  87  |   await steps.nth((await steps.count()) - 1).click();
  88  |   const mines = await page
  89  |     .locator('.cell.replay-mine')
  90  |     .evaluateAll((nodes) => nodes.map((n) => Number((n as HTMLElement).dataset.cell)));
  91  |   await page.locator('#replayExit').click();
  92  | 
  93  |   for (const cell of mines) {
  94  |     await cells(page).nth(cell).click();
  95  |     await cells(page).nth(cell).click();
  96  |   }
  97  | 
  98  |   await expect(page.locator('#banner')).toHaveClass(/win/);
  99  |   await expect(page.locator('#hudReveals')).toHaveText('0');
  100 |   await expect(page.locator('#bestLine')).toContainText('本配置最佳');
  101 | });
  102 | 
  103 | test('切换语言会同时更新静态文案与棋盘无障碍标签', async ({ page }) => {
  104 |   // Language lives on the settings view, which is out of reach mid-game.
  105 |   await page.locator('#exitGameBtn').click();
  106 |   await page.locator('#navHome').click();
  107 |   await page.locator('#cardSettings').click();
  108 |   await expect(page.locator('#viewSettings')).toBeVisible();
  109 |   await expect(page.locator('#viewSettings .rules li').first()).toContainText('每种颜色');
  110 | 
  111 |   await page.locator('#languageSelect').selectOption('en-US');
  112 |   await expect(page.locator('#viewSettings .rules li').first()).toContainText('exactly one mine');
  113 |   await expect(page.locator('#newGameBtn')).toHaveText('New game');
  114 |   // The board is only re-rendered when a game is running, so start one.
  115 |   await page.locator('#navPlay').click();
  116 |   await page.waitForSelector('.cell');
  117 |   await expect(cells(page).first()).toHaveAttribute('aria-label', /Row 1, column 1/);
  118 | 
  119 |   await page.locator('#exitGameBtn').click();
  120 |   await page.locator('#navHome').click();
  121 |   await page.locator('#cardSettings').click();
  122 |   await page.locator('#languageSelect').selectOption('zh-CN');
  123 |   await expect(page.locator('#viewSettings .rules li').first()).toContainText('每种颜色');
  124 | });
  125 | 
  126 | test('键盘可以移动、标记与翻开', async ({ page }) => {
  127 |   await cells(page).first().focus();
  128 |   await page.keyboard.press('ArrowRight');
  129 |   await page.keyboard.press('ArrowDown');
  130 |   await expect(cells(page).nth(11)).toBeFocused();
  131 | 
  132 |   await page.keyboard.press('f');
  133 |   await page.keyboard.press('f');
  134 |   await expect(cells(page).nth(11)).toHaveClass(/flagged/);
  135 | });
  136 | 
  137 | test('按住拖动可以连续标记多个格子', async ({ page }) => {
  138 |   const boxes = await cells(page).evaluateAll((nodes) =>
  139 |     nodes.slice(0, 6).map((n) => {
  140 |       const r = (n as HTMLElement).getBoundingClientRect();
  141 |       return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  142 |     }),
  143 |   );
  144 |   await page.mouse.move(boxes[0].x, boxes[0].y);
  145 |   await page.mouse.down();
  146 |   for (const b of boxes.slice(1)) await page.mouse.move(b.x, b.y);
  147 |   await page.mouse.up();
  148 |   await expect(page.locator('.cell.unsure, .cell.flagged')).not.toHaveCount(0);
  149 |   const marked = await page.locator('.cell.unsure, .cell.flagged').count();
  150 |   expect(marked).toBeGreaterThan(1);
  151 | });
  152 | 
  153 | test('提示有次数上限，且每次沿推导链递进', async ({ page }) => {
```