#!/usr/bin/env python3
"""Check the Velora Heat entry caps (game/ size, index size, screenshots,
dossier) and report pass or fail. Standard library only.

Usage:
    python3 tests/verify_package.py [--root REPO] [--out OUTDIR]

--root defaults to the repository root (the parent of this file's directory).
--out defaults to <root>/out. The dossier check is skipped (not failed) when
no dossier.json exists yet, because chunk 3 generates it; every other check
must pass. Exit code 0 when nothing fails, 1 otherwise.
"""

import argparse
import json
import os
import sys
from pathlib import Path

MAX_GAME_PATHS = 993
MAX_GAME_BYTES = 48 * 1024 * 1024
MAX_PATH_BYTES = 1000
MAX_INDEX_BYTES = 1024 * 1024
MAX_SCREENSHOT_BYTES = 256 * 1024
MAX_DOSSIER_BYTES = 1572864
MAX_DOSSIER_TEXT_BYTES = 163840
SHOT_EXTS = {".jpg", ".jpeg", ".png"}


def human(n):
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KiB"
    return f"{n / (1024 * 1024):.2f} MiB"


def main():
    parser = argparse.ArgumentParser(description="Verify the Velora Heat entry caps.")
    parser.add_argument("--root", default=None, help="repository root (default: parent of tests/)")
    parser.add_argument("--out", default=None, help="output dir holding dossier.json (default: <root>/out)")
    args = parser.parse_args()

    root = Path(args.root) if args.root else Path(__file__).resolve().parent.parent
    out = Path(args.out) if args.out else root / "out"
    game = root / "game"
    index = game / "index.html"
    shots = root / "screenshots"
    dossier = out / "dossier.json"

    results = []

    def check(name, ok, detail):
        results.append((name, ok, detail))
        print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")

    # game/ must exist.
    if not game.is_dir():
        check("game/ exists", False, f"{game} is not a directory")
        print("FAILED")
        return 1

    # Walk game/: count paths (files + dirs), total bytes, longest path.
    n_paths = 0
    total = 0
    longest = 0
    longest_path = ""
    for dirpath, dirnames, filenames in os.walk(game):
        for d in dirnames:
            n_paths += 1
            p = Path(dirpath) / d
            n = len(str(p.relative_to(game)).encode("utf-8"))
            if n > longest:
                longest, longest_path = n, str(p.relative_to(game))
        for f in filenames:
            n_paths += 1
            p = Path(dirpath) / f
            total += p.stat().st_size
            n = len(str(p.relative_to(game)).encode("utf-8"))
            if n > longest:
                longest, longest_path = n, str(p.relative_to(game))

    check("game/ path count", n_paths <= MAX_GAME_PATHS, f"{n_paths} paths (max {MAX_GAME_PATHS})")
    check("game/ total bytes", total <= MAX_GAME_BYTES, f"{human(total)} (max 48 MiB)")
    check(
        "game/ path length",
        longest <= MAX_PATH_BYTES,
        f"longest {longest} B ({longest_path!r}) (max {MAX_PATH_BYTES} B)",
    )

    # index.html.
    if not index.is_file():
        check("game/index.html", False, "missing")
    else:
        size = index.stat().st_size
        check("game/index.html", size <= MAX_INDEX_BYTES, f"{human(size)} (max 1 MiB)")

    # screenshots/: 3 or 4 images, each <= 256 KiB.
    if not shots.is_dir():
        check("screenshots/", False, "missing (chunk 3 creates it)")
    else:
        files = sorted(p for p in shots.iterdir() if p.is_file() and not p.name.startswith("."))
        bad_ext = [p.name for p in files if p.suffix.lower() not in SHOT_EXTS]
        oversize = [(p.name, p.stat().st_size) for p in files if p.stat().st_size > MAX_SCREENSHOT_BYTES]
        ok = len(files) in (3, 4) and not bad_ext and not oversize
        detail = f"{len(files)} files (need 3 or 4)"
        if bad_ext:
            detail += f"; bad extensions: {', '.join(bad_ext)}"
        if oversize:
            detail += "; oversize: " + ", ".join(f"{n} ({human(s)})" for n, s in oversize)
        check("screenshots/", ok, detail)

    # dossier.json: skip (not fail) when it does not exist yet.
    if not dossier.is_file():
        print(f"[SKIP] dossier.json: {dossier} not present yet (chunk 3 generates it)")
    else:
        size = dossier.stat().st_size
        check("dossier.json", size <= MAX_DOSSIER_BYTES, f"{human(size)} (max {MAX_DOSSIER_BYTES} B)")
        text = json.loads(dossier.read_text())["text"]
        check("dossier text", len(text.encode()) <= MAX_DOSSIER_TEXT_BYTES, f"{human(len(text.encode()))} (max {MAX_DOSSIER_TEXT_BYTES} B)")

    failed = [name for name, ok, _ in results if not ok]
    print("PASSED" if not failed else f"FAILED: {', '.join(failed)}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
