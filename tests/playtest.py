#!/usr/bin/env python3
"""Drive the Velora Heat game in a headless browser through Chrome DevTools
(CDP) and report what worked. Standard library only — the WebSocket client
below is hand-rolled (socket + base64 + struct).

Usage:
    python3 tests/playtest.py [--url URL] [--chrome BIN] [--shot PATH]

The dev server (node serve.ts, port 8080) is started automatically when
nothing answers there, and stopped at the end unless --keep is given.
Chrome is launched headless with --remote-debugging-port=9222.

Checks: page loads, title screen visible, no console errors, walk smoke
(W key moves the player when the game exposes window.__game; otherwise the
check only proves no errors appeared while walking). Carjack, drive,
police and missions are probed through the same window.__game hook when the
game exposes it and reported as SKIP otherwise — chunk 3 wires the full
flow. Exit code 0 when nothing fails, 1 otherwise.
"""

import argparse
import base64
import http.client
import json
import os
import shutil
import signal
import socket
import struct
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path

CDP_PORT = 9222
GAME_URL = "http://localhost:8080"

CHROME_NAMES = [
    "chromium", "chromium-browser", "google-chrome", "google-chrome-stable",
    "chrome", "headless_shell", "chrome-headless-shell",
]
CHROME_PATHS = [
    "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
    "/opt/google/chrome/chrome", "/snap/bin/chromium",
]


# ---------------------------------------------------------------- WebSocket
class WSClosed(Exception):
    pass


class WSClient:
    """Minimal WebSocket client: text frames, client masking, ping/pong,
    fragmented-message reassembly, 16-bit and 64-bit lengths."""

    def __init__(self, url, timeout=30):
        # url is ws://host:port/path
        rest = url.split("://", 1)[1]
        hostport, _, path = rest.partition("/")
        host, _, port = hostport.partition(":")
        self.sock = socket.create_connection((host, int(port or 80)), timeout=timeout)
        self.sock.settimeout(timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET /{path} HTTP/1.1\r\n"
            f"Host: {hostport}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise WSClosed("handshake closed")
            buf += chunk
        if b"101" not in buf.split(b"\r\n", 1)[0]:
            raise WSClosed(f"handshake failed: {buf[:200]!r}")
        self._buf = b""

    def _recv_exact(self, n):
        while len(self._buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise WSClosed("socket closed")
            self._buf += chunk
        out, self._buf = self._buf[:n], self._buf[n:]
        return out

    def send_text(self, text):
        payload = text.encode("utf-8")
        mask = os.urandom(4)
        header = bytearray([0x81])
        n = len(payload)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(header) + mask + masked)

    def _send_pong(self, payload):
        header = bytearray([0x8A, 0x80 | len(payload)])
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(header) + mask + masked)

    def recv_text(self):
        # Reassemble one full text message (following continuations).
        parts = []
        while True:
            b0, b1 = self._recv_exact(2)
            fin = b0 & 0x80
            opcode = b0 & 0x0F
            length = b1 & 0x7F
            if length == 126:
                length = struct.unpack(">H", self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack(">Q", self._recv_exact(8))[0]
            if b1 & 0x80:
                self._recv_exact(4)  # server frames are unmasked; skip if set
            payload = self._recv_exact(length) if length else b""
            if opcode == 9:  # ping -> pong
                self._send_pong(payload)
                continue
            if opcode == 8:
                raise WSClosed("server closed the connection")
            if opcode in (1, 0):
                parts.append(payload)
                if fin:
                    return b"".join(parts).decode("utf-8", "replace")
            # Other opcodes (binary) are ignored.

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


# ---------------------------------------------------------------- CDP
class CDP:
    def __init__(self, ws_url):
        self.ws = WSClient(ws_url)
        self.next_id = 1
        self.events = []

    def call(self, method, params=None, timeout=30):
        mid = self.next_id
        self.next_id += 1
        self.ws.send_text(json.dumps({"id": mid, "method": method, "params": params or {}}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            msg = json.loads(self.ws.recv_text())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"CDP {method}: {msg['error']}")
                return msg.get("result", {})
            self.events.append(msg)
        raise TimeoutError(f"CDP {method} timed out")

    def drain(self, seconds=0.2):
        self.ws.sock.settimeout(seconds)
        try:
            while True:
                self.events.append(json.loads(self.ws.recv_text()))
        except (socket.timeout, TimeoutError, WSClosed):
            pass
        finally:
            self.ws.sock.settimeout(30)

    def evaluate(self, expression):
        res = self.call("Runtime.evaluate", {
            "expression": expression, "returnByValue": True, "awaitPromise": True,
        })
        if res.get("exceptionDetails"):
            raise RuntimeError(f"evaluate failed: {res['exceptionDetails']}")
        return res.get("result", {}).get("value")

    def key(self, kind, code, key, vk):
        self.call("Input.dispatchKeyEvent", {
            "type": kind, "code": code, "key": key,
            "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk,
        })

    def close(self):
        self.ws.close()


# ---------------------------------------------------------------- helpers
def find_chrome(explicit=None):
    if explicit and Path(explicit).exists():
        return explicit
    for name in CHROME_NAMES:
        found = shutil.which(name)
        if found:
            return found
    for p in CHROME_PATHS:
        if Path(p).exists():
            return p
    return None


def http_get(url, timeout=3):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status, r.read()
    except Exception:
        return None, None


def wait_for_http(url, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        status, _ = http_get(url)
        if status is not None:
            return True
        time.sleep(0.4)
    return False


def get_ws_url(port):
    status, body = http_get(f"http://localhost:{port}/json/list", timeout=5)
    if status is None:
        raise RuntimeError("no DevTools endpoint — is Chrome running?")
    targets = json.loads(body)
    for t in targets:
        if t.get("type") == "page":
            return t["webSocketDebuggerUrl"]
    raise RuntimeError("no page target in /json/list")


# ---------------------------------------------------------------- checks
class Reporter:
    def __init__(self):
        self.rows = []

    def add(self, name, status, detail=""):
        self.rows.append((name, status, detail))
        print(f"[{status}] {name}" + (f": {detail}" if detail else ""))

    def failed(self):
        return [n for n, s, _ in self.rows if s == "FAIL"]

    def summary(self):
        failed = self.failed()
        print("PASSED" if not failed else f"FAILED: {', '.join(failed)}")
        return 0 if not failed else 1


def collect_errors(cdp):
    errors = []
    for ev in cdp.events:
        m = ev.get("method", "")
        if m == "Runtime.exceptionThrown":
            d = ev.get("params", {}).get("exceptionDetails", {})
            errors.append(str(d.get("exception", {}).get("description", d.get("text", "exception"))))
        elif m == "Runtime.consoleAPICalled" and ev.get("params", {}).get("type") == "error":
            args = ev.get("params", {}).get("args", [])
            errors.append(" ".join(str(a.get("value", a.get("description", ""))) for a in args))
        elif m == "Log.entryAdded":
            e = ev.get("params", {}).get("entry", {})
            if e.get("level") == "error":
                errors.append(str(e.get("text", "")))
    return errors


def main():
    parser = argparse.ArgumentParser(description="Headless playtest for Velora Heat.")
    parser.add_argument("--url", default=GAME_URL)
    parser.add_argument("--chrome", default=None)
    parser.add_argument("--cdp-port", type=int, default=CDP_PORT)
    parser.add_argument("--shot", default=None, help="save a JPEG screenshot to this path at the end")
    parser.add_argument("--keep", action="store_true", help="do not stop the server/Chrome we started")
    args = parser.parse_args()

    rep = Reporter()
    repo = Path(__file__).resolve().parent.parent
    server_proc = None
    chrome_proc = None
    user_data = Path(f"/tmp/velora-playtest-{uuid.uuid4().hex[:8]}")

    try:
        # Dev server on 8080.
        status, _ = http_get(args.url, timeout=3)
        if status is None:
            server_proc = subprocess.Popen(
                ["node", "serve.ts"], cwd=repo,
                env={**os.environ, "PORT": "8080"},
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            if not wait_for_http(args.url, timeout=15):
                rep.add("dev server", "FAIL", "node serve.ts did not answer on :8080")
                return rep.summary()
            rep.add("dev server", "PASS", "started node serve.ts on :8080")
        else:
            rep.add("dev server", "PASS", f"already answering on {args.url}")

        # Headless Chrome with CDP.
        chrome = find_chrome(args.chrome)
        if not chrome:
            rep.add("chrome", "FAIL", "no Chrome/Chromium binary found")
            return rep.summary()
        chrome_proc = subprocess.Popen(
            [chrome, "--headless=new", f"--remote-debugging-port={args.cdp_port}",
             "--no-sandbox", "--disable-gpu", "--window-size=1280,720",
             f"--user-data-dir={user_data}", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        if not wait_for_http(f"http://localhost:{args.cdp_port}/json/version", timeout=20):
            rep.add("chrome", "FAIL", "DevTools endpoint did not come up")
            return rep.summary()

        cdp = CDP(get_ws_url(args.cdp_port))
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call("Log.enable")
        cdp.call("Emulation.setDeviceMetricsOverride", {
            "width": 1280, "height": 720, "deviceScaleFactor": 1, "mobile": False,
        })

        # 1. Page loads.
        cdp.call("Page.navigate", {"url": args.url})
        time.sleep(4)
        cdp.drain(0.5)
        loaded = cdp.evaluate("document.readyState")
        rep.add("page loads", "PASS" if loaded in ("interactive", "complete") else "FAIL",
                f"readyState={loaded}")

        # 2. Title screen visible.
        title = cdp.evaluate("""(() => {
          const text = document.body ? document.body.innerText || '' : '';
          const canvas = !!document.querySelector('canvas');
          const hasTitle = /velora/i.test(text);
          return { canvas, hasTitle, snippet: text.slice(0, 120) };
        })()""")
        rep.add("title screen", "PASS" if title.get("canvas") and title.get("hasTitle") else "FAIL",
                f"canvas={title.get('canvas')} titleText={title.get('hasTitle')} snippet={title.get('snippet', '')!r}")

        # 3. Walk smoke: move with W when the game exposes window.__game.
        state = cdp.evaluate("(() => { const g = window.__game; if (!g || !g.player) return null; return { x: g.player.position.x, z: g.player.position.z }; })()")
        if state is not None:
            before = (state["x"], state["z"])
            cdp.key("rawKeyDown", "KeyW", "w", 87)
            time.sleep(1.5)
            cdp.key("keyUp", "KeyW", "w", 87)
            after = cdp.evaluate("(() => { const g = window.__game; return { x: g.player.position.x, z: g.player.position.z }; })()")
            moved = ((after["x"] - before[0]) ** 2 + (after["z"] - before[1]) ** 2) ** 0.5
            rep.add("walk (W key)", "PASS" if moved > 0.5 else "FAIL",
                    f"moved {moved:.2f} m in 1.5 s")
        else:
            cdp.key("rawKeyDown", "KeyW", "w", 87)
            time.sleep(1.0)
            cdp.key("keyUp", "KeyW", "w", 87)
            cdp.drain(0.3)
            errs = collect_errors(cdp)
            rep.add("walk (W key)", "SKIP" if not errs else "FAIL",
                    "window.__game not exposed yet (chunk 3 wires it); no errors while walking"
                    if not errs else f"errors while walking: {errs[0]}")

        # 4. Full flow (carjack, drive, police, missions): probe the hook,
        # skip honestly when the game does not expose it yet.
        hook = cdp.evaluate("(() => { const g = window.__game; if (!g) return null; return { missions: !!g.missions, police: !!g.police, driving: !!g.driving }; })()")
        for name in ("carjack", "drive", "police", "missions"):
            if hook is None:
                rep.add(name, "SKIP", "window.__game not exposed yet (chunk 3 fills the full flow)")
            else:
                rep.add(name, "SKIP", f"hook present={hook}; full flow assertions land in chunk 3")

        # 5. Console errors across the whole run.
        cdp.drain(0.5)
        errors = collect_errors(cdp)
        rep.add("console errors", "PASS" if not errors else "FAIL",
                "none" if not errors else f"{len(errors)} error(s), first: {errors[0][:200]}")

        # Optional screenshot at the end.
        if args.shot:
            shot = cdp.call("Page.captureScreenshot", {"format": "jpeg", "quality": 80})
            Path(args.shot).write_bytes(base64.b64decode(shot["data"]))
            rep.add("screenshot", "PASS", f"saved {args.shot} ({Path(args.shot).stat().st_size} B)")

        cdp.close()
    finally:
        if not args.keep:
            for proc in (chrome_proc, server_proc):
                if proc and proc.poll() is None:
                    proc.send_signal(signal.SIGTERM)
                    try:
                        proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        proc.kill()
            shutil.rmtree(user_data, ignore_errors=True)

    return rep.summary()


if __name__ == "__main__":
    sys.exit(main())
