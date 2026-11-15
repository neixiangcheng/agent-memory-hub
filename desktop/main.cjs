// Desktop shell: starts the read-only viewer on an ephemeral port and shows it in a real window.
// No browser, no fixed port, no tray icon (yet). The window IS the app; closing it stops the server.
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

/** @type {{ url: string, close: () => Promise<void> } | null} */
let server = null;
/** @type {BrowserWindow | null} */
let win = null;

async function boot() {
  // dist/web.js is ESM and already owns the store, the API and the page; reuse it instead of forking logic.
  const mod = await import(path.join(__dirname, "..", "dist", "web.js"));
  server = await mod.startWeb({ port: 0, quiet: true });

  win = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: "#0f1115",
    title: "agent-memory-hub",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.setMenuBarVisibility(false);
  // Anything the page tries to open elsewhere belongs in the user's real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await win.loadURL(server.url);
  win.show();
  win.on("closed", () => {
    win = null;
  });
}

// One window per machine: a second launch focuses the first instead of racing for the same store.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(boot).catch((err) => {
    console.error("[desktop]", err);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) boot();
  });

  app.on("window-all-closed", async () => {
    if (server) await server.close().catch(() => {});
    server = null;
    app.quit();
  });
}
