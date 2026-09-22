# 发布流程

发布一个版本的完整步骤。按顺序执行，每步都可验证。

## 1. 确定版本号

采用语义化版本：`主版本.次版本.修订号`。

三处版本号**必须同时一致**，否则安装包与程序内显示会不一致：

| 文件 | 位置 |
|---|---|
| `package.json` | `"version"` |
| `src-tauri/tauri.conf.json` | `"version"` |
| `src-tauri/Cargo.toml` | `version =` |

```bash
# 例：升到 0.2.0（三条都要执行）
npm version 0.2.0 --no-git-tag-version
# 再手动同步 src-tauri/tauri.conf.json 与 src-tauri/Cargo.toml
```

## 2. 更新更新日志

在 `CHANGELOG.md` 顶部新增该版本小节，写清「新增 / 修复 / 变更」。
Release notes 直接复制这一节。

## 3. 全量验证

```bash
npm run typecheck
npm test          # 核心 + 数据层
npm run test:ui   # Playwright 界面测试
```

三项都必须通过。**任何一项不通过就不要发版**。

## 4. 构建产物

```bash
npm run build
npm run tauri:build                # 安装包 + exe
python scripts/package-portable.py # 便携版 zip
```

产出位置：

| 产物 | 路径 |
|---|---|
| NSIS 安装包 | `src-tauri/target/release/bundle/nsis/Color Mines_<版本>_x64-setup.exe` |
| 便携版 | `dist/ColorMines-<版本>-portable-win64.zip` |

## 5. 安装验证（不可跳过）

仅构建不算数——必须**安装 → 启动 → 确认改动真的生效**。
历史上多次出现「构建成功但用户看到的仍是旧版本」。

```bash
# 静默安装
"./Color Mines_<版本>_x64-setup.exe" /S
```

启动后确认：

- 设置页显示的**构建时间**与本次构建一致
- 数据目录中 `data/{maps,logs,backups,skins}` 均已创建
- 切换皮肤、开关局、复盘分栏均正常

## 6. 生成校验值

```bash
python scripts/checksums.py   # 输出 SHA256 到 release/SHA256SUMS.txt
```

## 7. 打标签并推送

```bash
git add -A
git commit -m "Release <版本>"
git tag -a v<版本> -m "v<版本>"
git push origin main --tags
```

## 8. 创建 GitHub Release

- **Tag**：`v<版本>`
- **标题**：`Color Mines v<版本>`
- **正文**：复制 `CHANGELOG.md` 中该版本的小节
- **附件**：
  - NSIS 安装包
  - 便携版 zip
  - `SHA256SUMS.txt`

勾选 **Set as the latest release**。

## 9. 仓库元数据（About）

在 GitHub 仓库页面的 About 区域填写：

- **Description**：`每种颜色恰好一个雷的扫雷变体，纯逻辑推理通关。Tauri 2 + TypeScript。`
- **Website**：如有演示页则填写，否则留空
- **Topics**：
  `minesweeper` `puzzle` `logic-puzzle` `tauri` `typescript` `rust`
  `desktop-app` `pwa` `game`

## 发布后

- 确认 Release 页面的附件可下载
- 用便携版在新环境（或无数据目录的环境）跑一次，确认首次启动正常
- 更新 `README.md` 下载表中的版本号占位
