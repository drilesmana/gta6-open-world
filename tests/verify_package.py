#!/usr/bin/env python3
"""verify_package.py — Velora Heat (chunk 2)
Check the entry caps from the spec and report pass/fail:
- game/: at most 993 files and directories, at most 48 MiB total.
- Every path under game/: at most 1000 bytes.
- game/index.html: at most 1 MiB.
- screenshots/: 3 or 4 visible regular image files (jpg/jpeg/png),
  each at most 256 KiB.
- Dossier presence: out/dossier.json (or dossier.json at the repo root).
Usage: python3 tests/verify_package.py [--root DIR]
Exit code 0 when every check passes, 1 otherwise.
"""

import os
import sys
from pathlib import Path

MAX_GAME_PATHS = 993
MAX_GAME_BYTES = 48 * 1024 * 1024
MAX_PATH_BYTES = 1000
MAX_INDEX_BYTES = 1024 * 1024
MAX_SCREENSHOTS = 4
MIN_SCREENSHOTS = 3
MAX_SCREENSHOT_BYTES = 256 * 1024
IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


def check(name, ok, detail):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}: {detail}")
    return ok


def main():
    root = Path(sys.argv[sys.argv.index("--root") + 1]) if "--root" in sys.argv else Path(__file__).resolve().parent.parent
    game_dir = root / "game"
    shots_dir = root / "screenshots"
    results = []

    # --- game/ caps ---
    if not game_dir.is_dir():
        print("[FAIL] game dir: missing " + str(game_dir))
        return 1
    total_paths = 0
    total_bytes = 0
    longest_path = 0
    longest_name = ""
    for dirpath, dirnames, filenames in os.walk(game_dir):
        dirnames.sort()
        for d in dirnames:
            total_paths += 1
            p = Path(dirpath) / d
            if len(str(p)) > longest_path:
                longest_path = len(str(p))
                longest_name = str(p)
        for f in sorted(filenames):
            total_paths += 1
            p = Path(dirpath) / f
            if len(str(p)) > longest_path:
                longest_path = len(str(p))
                longest_name = str(p)
            try:
                total_bytes += p.stat().st_size
            except OSError:
                pass
    results.append(check("game path count", total_paths <= MAX_GAME_PATHS,
                         f"{total_paths} paths (max {MAX_GAME_PATHS})"))
    results.append(check("game total bytes", total_bytes <= MAX_GAME_BYTES,
                         f"{total_bytes} bytes (max {MAX_GAME_BYTES})"))
    results.append(check("game longest path", longest_path <= MAX_PATH_BYTES,
                         f"{longest_path} bytes: {longest_name} (max {MAX_PATH_BYTES})"))

    index = game_dir / "index.html"
    if index.is_file():
        size = index.stat().st_size
        results.append(check("index.html bytes", size <= MAX_INDEX_BYTES,
                             f"{size} bytes (max {MAX_INDEX_BYTES})"))
    else:
        results.append(check("index.html exists", False, "game/index.html missing"))

    # --- screenshots/ caps ---
    if not shots_dir.is_dir():
        results.append(check("screenshots dir", False, "screenshots/ missing (need 3-4 images)"))
    else:
        images = sorted(
            p for p in shots_dir.iterdir()
            if p.is_file() and not p.name.startswith(".") and p.suffix.lower() in IMAGE_EXTS
        )
        results.append(check("screenshot count", MIN_SCREENSHOTS <= len(images) <= MAX_SCREENSHOTS,
                             f"{len(images)} images (need {MIN_SCREENSHOTS}-{MAX_SCREENSHOTS}): "
                             + ", ".join(p.name for p in images)))
        for p in images:
            size = p.stat().st_size
            results.append(check(f"screenshot {p.name}", size <= MAX_SCREENSHOT_BYTES,
                                 f"{size} bytes (max {MAX_SCREENSHOT_BYTES})"))

    # --- dossier presence ---
    dossier_candidates = [root / "out" / "dossier.json", root / "dossier.json"]
    found = [p for p in dossier_candidates if p.is_file()]
    results.append(check("dossier presence", bool(found),
                         str(found[0]) if found else "no dossier.json in out/ or repo root (run: MAKEFUN_OUTPUT_DIR=out node main.ts)"))

    passed = sum(1 for r in results if r)
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
