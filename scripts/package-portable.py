#!/usr/bin/env python3
"""Package a portable Windows build (spec §34).

Tauri emits a single executable plus an installer; a zip with just the exe is a
useful third option for anyone who cannot run an installer. The exe is
self-contained apart from the system WebView2 runtime, which the bundle notes
explicitly.

    python scripts/package-portable.py
"""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / "src-tauri" / "target" / "release" / "color-mines.exe"
OUT_DIR = ROOT / "dist"

NOTICE = """Color Mines 便携版
==================

直接运行 color-mines.exe 即可，无需安装，也不会写入注册表。
对局记录与最佳成绩保存在浏览器/应用的数据目录中。

系统要求
--------
Windows 10 或 11，且已安装 WebView2 运行时。
Windows 11 自带；Windows 10 若提示缺少运行时，请从微软官网安装
"Microsoft Edge WebView2 Runtime"。

卸载
----
删除本文件夹即可。若想同时清除成绩记录，请一并删除：
  %LOCALAPPDATA%\\colormines

许可
----
AGPL-3.0，详见随附的 LICENSE 与 THIRD-PARTY-NOTICES.md。
"""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    if not EXE.exists():
        print(f"error: {EXE} not found — run `npm run tauri:build` first", file=__file__)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    archive = OUT_DIR / f"ColorMines-{version}-portable-win64.zip"

    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(EXE, "color-mines.exe")
        if (ROOT / "LICENSE").exists():
            zf.write(ROOT / "LICENSE", "LICENSE")
        if (ROOT / "THIRD-PARTY-NOTICES.md").exists():
            zf.write(ROOT / "THIRD-PARTY-NOTICES.md", "THIRD-PARTY-NOTICES.md")
        zf.writestr("使用说明.txt", NOTICE)

    print(f"  size   : {archive.stat().st_size / 1e6:.1f} MB")
    print(f"  sha256 : {sha256(archive)}")
    print("portable archive ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
