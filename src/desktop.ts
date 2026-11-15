// Desktop window without shipping a browser engine: start the viewer, then open it in Chromium's
// app mode (`--app=URL`). No address bar, no tabs, its own taskbar entry and window — it reads as a
// desktop app while using the Edge/Chrome that is already installed.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { startWeb, type WebHandle } from "./web.ts";
import type { Store } from "./store.ts";

const CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/microsoft-edge",
];

export function findBrowser(): string | null {
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

export interface DesktopOptions {
  port?: number;
  store?: Store;
  /** reuse an already-running server instead of starting one (the URL to open) */
  url?: string;
}

export interface DesktopHandle {
  url: string;
  browser: string;
  /** resolves when the app window closes */
  closed: Promise<void>;
  stop: () => Promise<void>;
}

export function startDesktop(o: DesktopOptions = {}): Promise<DesktopHandle> {
  const browser = findBrowser();
  if (!browser) {
    return Promise.reject(
      new Error("no Chromium-based browser found (Edge or Chrome); install one, or use `amh web` in a browser"),
    );
  }

  return new Promise<DesktopHandle>((resolvePromise, reject) => {
    void (async () => {
      let web: WebHandle | null = null;
      try {
        if (o.url) {
          web = { url: o.url, close: async () => {} };
        } else {
          web = await startWeb({ port: o.port ?? 0, quiet: true, store: o.store });
        }
      } catch (err) {
        reject(err);
        return;
      }

      const profileDir = join(process.env.AMH_HOME ?? join(homedir(), ".agent-memory-hub"), "window");
      const args = [
        `--app=${web.url}`,
        "--window-size=1280,880",
        // A private profile keeps the window independent of the user's normal browser session
        // (no restored tabs, no extension interference, no proxy extension hijacking localhost).
        `--user-data-dir=${profileDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=Translate",
      ];

      let child: ChildProcess;
      try {
        child = spawn(browser, args, { stdio: "ignore", detached: false });
      } catch (err) {
        await web.close().catch(() => {});
        reject(err);
        return;
      }

      const stop = async () => {
        if (!child.killed) child.kill();
        await web.close().catch(() => {});
      };

      const closed = new Promise<void>((done) => {
        child.on("exit", () => {
          void web.close().catch(() => {});
          done();
        });
        child.on("error", () => {
          void web.close().catch(() => {});
          done();
        });
      });

      console.log(`agent-memory-hub window: ${web.url}`);
      console.log(`browser: ${browser}`);
      console.log("close the window to stop the server");
      resolvePromise({ url: web.url, browser, closed, stop });
    })();
  });
}

/** Entry point for `amh desktop`: open the window and exit when it closes. */
export async function runDesktop(o: DesktopOptions = {}): Promise<void> {
  const handle = await startDesktop(o);
  await handle.closed;
  process.exit(0);
}
