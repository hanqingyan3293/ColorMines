#!/usr/bin/env python3
"""Collect release artefacts into release/ and write SHA256SUMS.txt.

Run after `npm run tauri:build` and `scripts/package-portable.py`.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "release"
CHUNK = 1 << 20


def version() -> str:
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    return str(pkg.get("version", "0.0.0"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(CHUNK), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    ver = version()
    OUT.mkdir(exist_ok=True)

    candidates = [
        ROOT / "src-tauri" / "target" / "release" / "bundle" / "nsis"
        / f"Color Mines_{ver}_x64-setup.exe",
        ROOT / "dist" / f"ColorMines-{ver}-portable-win64.zip",
    ]

    copied: list[Path] = []
    for src in candidates:
        if not src.exists():
            print(f"missing: {src}")
            continue
        # Spaces in file names are hostile to download links; normalise here.
        dest = OUT / src.name.replace(" ", "")
        shutil.copy2(src, dest)
        copied.append(dest)
        print(f"copied: {dest.name}")

    if not copied:
        print("nothing to release - build first")
        return 1

    sums = OUT / "SHA256SUMS.txt"
    lines = [f"{sha256(p)}  {p.name}" for p in copied]
    sums.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nwrote {sums.name}")
    for line in lines:
        print("  " + line[:32] + "...  " + line.split("  ")[-1])

    print(f"\nrelease/ ready for v{ver}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
