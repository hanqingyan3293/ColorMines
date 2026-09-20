# Third-party notices

Color Mines is licensed under the **GNU Affero General Public License v3.0**
(see `LICENSE`). This file lists the third-party components it ships with.

The game logic — board model, solvers, generator, session rules — is written for
this project and carries no external dependency.

## Runtime

The web client and the desktop client render the **same** bundle, so there is
only one set of runtime dependencies to disclose.

| Component | Version | License | Notes |
|---|---|---|---|
| Microsoft **WebView2** (Edge WebView runtime) | system-provided | Microsoft Software License Terms | Windows only. Already present on Windows 11; the installer can bootstrap it on Windows 10. Not bundled by this project. |

No JavaScript framework, no UI library, and no runtime package is bundled — the
entire client is hand-written TypeScript plus CSS.

## Build-time only

These are used to produce the artefacts and are **not** distributed to users
(they are compiled away or live in `node_modules/` / `src-tauri/target/`).

| Component | License |
|---|---|
| TypeScript | Apache-2.0 |
| Vite | MIT |
| tsx | MIT |
| @tauri-apps/cli, @tauri-apps/api | MIT or Apache-2.0 |
| Rust crates under `src-tauri/` (tauri, tauri-build and transitive deps) | MIT / Apache-2.0 / BSD — see `cargo-deny` or `cargo tree` output for the exact graph |
| NSIS (downloaded by the Tauri bundler) | zlib/libpng |

Run `cargo tree` inside `src-tauri/` to enumerate the exact Rust dependency
graph for a given release.

## Fonts and icons

- No web fonts are loaded; the UI uses the system font stack.
- `app-icon.png` and the generated icons under `src-tauri/icons/` are original
  artwork for this project.
