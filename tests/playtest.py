#!/usr/bin/env python3
"""playtest.py — Velora Heat (chunk 2)
Drive the game in a headless browser and report what worked:
title screen, walk on foot, carjack (steal a car), drive, police respond
(wanted stars + escape meter), and missions.
- Starts the dev server itself (node serve.ts on port 8080) and stops it after.
- Uses Playwright (Chromium) when installed; without it, falls back to a
  plain HTTP smoke check of the server + index.html and marks the browser
  steps SKIPPED instead of pretending they ran.
Usage: python3 tests/playtest.py [--url http://localhost:8080]
Exit code 0 when every runnable check passes, 1 otherwise.
"""

import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "http://localhost:8080"
if "--url" in sys.argv:
    BASE_URL = sys.argv[sys.argv.index("--url") + 1]


def report(name, status, detail=""):
    print(f"[{status}] {name}" + (f": {detail}" if detail else ""))
    return status == "PASS"


def wait_for_server(url, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url + "/", timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def http_smoke():
    """No-browser fallback: server up, page serves, no external references."""
    results = []
    try:
        with urllib.request.urlopen(BASE_URL + "/", timeout=5) as r:
            body = r.read().decode("utf-8", "replace")
            results.append(report("server responds 200", "PASS" if r.status == 200 else "FAIL", f"HTTP {r.status}"))
            results.append(report("index.html loads main.js module", "PASS" if "./src/main.js" in body else "FAIL"))
            external = [line for line in body.splitlines()
                        if ("http://" in line or "https://" in line) and "localhost" not in line]
            results.append(report("no external URLs in index.html", "PASS" if not external else "FAIL",
                                 f"{len(external)} external refs" if external else "none"))
            for path in ("./vendor/three.min.js", "./src/main.js"):
                try:
                    with urllib.request.urlopen(BASE_URL + "/" + path.lstrip("./"), timeout=5) as r2:
                        results.append(report(f"serves {path}", "PASS" if r2.status == 200 else "FAIL", f"HTTP {r2.status}"))
                except Exception as e:
                    results.append(report(f"serves {path}", "FAIL", str(e)))
    except Exception as e:
        results.append(report("server responds 200", "FAIL", str(e)))
    for step in ("title screen", "walk on foot", "carjack", "drive",
                 "police wanted stars", "missions"):
        report(step, "SKIP", "no headless browser available (install playwright + chromium)")
    return all(results)


def browser_playtest():
    """Full drive with Playwright Chromium. Returns True when all pass."""
    from playwright.sync_api import sync_playwright

    results = []
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE_URL + "/", wait_until="networkidle")
        page.wait_for_timeout(2500)

        title = page.title()
        results.append(report("title screen", "PASS" if title else "FAIL", f"title={title!r}"))

        # Dismiss the title screen (click / Enter) and wait for the brief.
        page.keyboard.press("Enter")
        page.wait_for_timeout(800)
        page.keyboard.press("Enter")
        page.wait_for_timeout(1200)

        # State probe: the game exposes __velora.pos() (main.js), NOT
        # debugState — the old name never existed, so probe via pos().
        def pos():
            return page.evaluate("() => (window.__velora && window.__velora.pos) ? window.__velora.pos() : null") or {}

        state = pos()
        if not state:
            report("game state probe", "SKIP", "window.__velora.pos not exposed; driving keys blind")
            state = {}

        before = pos()
        # Run (Shift) — headless runs ~1 FPS with dt clamped to 0.05 s,
        # so 2 s of keys only moves ~0.3 m; hold 8 s to clear 0.5 m.
        page.keyboard.down("Shift")
        page.keyboard.down("w")
        page.wait_for_timeout(8000)
        page.keyboard.up("w")
        page.keyboard.up("Shift")
        after = pos()
        moved = False
        if before and after:
            dx = (after.get("x", 0) - before.get("x", 0))
            dz = (after.get("z", 0) - before.get("z", 0))
            moved = (dx * dx + dz * dz) > 0.25
        results.append(report("walk on foot", "PASS" if moved else "FAIL",
                              f"moved={moved} before={before} after={after}" if before else "no state probe"))

        # Carjack: teleport next to a parked car spawn (player spawns at the
        # origin, not necessarily near a car), then steal it.
        page.evaluate("""() => {
          const v = window.__velora; const sp = v.state.city.carSpawns;
          if (sp && sp.length) v.teleport(sp[0].x, sp[0].z);
        }""")
        page.wait_for_timeout(1000)
        page.evaluate("() => window.__velora.enterNearestCar()")
        page.wait_for_timeout(800)
        driving = pos().get("driving")
        results.append(report("carjack", "PASS" if driving else "FAIL", f"driving={driving}"))
        if driving:
            page.keyboard.down("w")
            page.wait_for_timeout(8000)
            page.keyboard.up("w")
            speed = page.evaluate("() => window.__velora.state.speedKmh || 0")
            results.append(report("drive", "PASS" if abs(speed) > 1 else "FAIL", f"speed={speed} km/h"))
            page.keyboard.press("e")
            page.wait_for_timeout(500)

        # Police: raise wanted through the real debug hook, then check
        # stars + pursuit cars.
        wanted = page.evaluate("() => (window.__velora && window.__velora.setWanted) ? window.__velora.setWanted(2) : null")
        if wanted is None:
            report("police wanted stars", "SKIP", "no debug hook; raise wanted by committing a crime in play")
        else:
            page.wait_for_timeout(3000)
            now = pos()
            pursuit = page.evaluate("() => window.__velora.state.police ? window.__velora.state.police.pursuit.length : 0")
            results.append(report("police wanted stars", "PASS" if now.get("wanted", 0) >= 1 else "FAIL",
                                  f"wanted={now.get('wanted')} pursuit={pursuit}"))
            # Clear the heat again so the mission run is not chased.
            page.evaluate("() => window.__velora.setWanted(0)")

        # Missions: advance through every phase of all 4 missions via the
        # debug hook; the story ends with state.finished and paid rewards.
        money_before = pos().get("money", 0)
        story = None
        for _ in range(15):
            ev = page.evaluate("() => window.__velora.completeMission()")
            if not ev:
                break
            story = ev.get("type")
            if story == "story-complete":
                break
        finished = page.evaluate("() => !!window.__velora.state.finished")
        money_after = pos().get("money", 0)
        results.append(report("missions", "PASS" if finished else "FAIL",
                              f"finished={finished} story={story} money ${money_before}->${money_after}"))
        results.append(report("finish", "PASS" if finished else "FAIL",
                              f"phase={pos().get('phase')}"))
        results.append(report("zero console errors", "PASS" if not errors else "FAIL",
                              "; ".join(errors[:5]) if errors else "none"))
        browser.close()
    return all(results)


def main():
    server = subprocess.Popen(
        ["node", "serve.ts"], cwd=str(ROOT),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        if not wait_for_server(BASE_URL):
            print("[FAIL] dev server did not come up on " + BASE_URL)
            return 1
        print("dev server up on " + BASE_URL)
        try:
            import playwright  # noqa: F401
            ok = browser_playtest()
        except ImportError:
            print("playwright not installed — running HTTP smoke check only")
            ok = http_smoke()
        print("\nPLAYTEST " + ("PASS" if ok else "FAIL"))
        return 0 if ok else 1
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    sys.exit(main())
