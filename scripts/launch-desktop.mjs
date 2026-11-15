// Launches the desktop shell with a clean electron environment.
//
// Why this exists: some environments (IDEs, agent harnesses, terminal integrations) export
// ELECTRON_RUN_AS_NODE=1. Under that variable electron.exe behaves like plain node, so `require("electron")`
// returns the executable path instead of the `app`/`BrowserWindow` API and the app dies with
// "Cannot read properties of undefined (reading 'requestSingleInstanceLock')".
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));

let electronPath;
try {
  electronPath = require("electron");
} catch {
  console.error("electron is not installed: run `npm install` first (it is a devDependency).");
  process.exit(1);
}
if (typeof electronPath !== "string") {
  console.error("could not resolve the electron executable");
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;

const child = spawn(electronPath, [join(pkgRoot, "desktop", "main.cjs"), ...process.argv.slice(2)], {
  cwd: pkgRoot,
  env,
  stdio: "inherit",
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
