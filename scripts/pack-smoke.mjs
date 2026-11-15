// Pack the published artifact and run the CLI out of the unpacked tarball.
// Deliberately offline: the machine that builds this may not reach a registry, and what needs proving is
// the tarball itself — that `files` ships the right things and that bin/amh.mjs -> dist/cli.js resolves.
// `AMH_SMOKE_INSTALL=1` additionally does a real `npm install <tarball>` into a clean project (needs network).
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const repo = process.cwd();
const work = mkdtempSync(join(tmpdir(), "amh-pack-"));

/**
 * npm ships next to node, but the layout differs: Windows keeps it in
 * `<node>/node_modules/npm/bin/npm-cli.js`, Linux/macOS in `<node>/../lib/node_modules/...`.
 * Calling the JS entry avoids the `.cmd` shim on Windows; `npm_execpath` covers `npm run` callers.
 */
function npmEntry() {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv && fromEnv.includes("npm-cli.js") && existsSync(fromEnv)) return fromEnv;
  const bin = dirname(process.execPath);
  const candidates = [
    join(bin, "node_modules", "npm", "bin", "npm-cli.js"),
    join(bin, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

const npmCli = npmEntry();
const npm = (args, cwd) => {
  if (!npmCli) return execFileSync("npm", args, { cwd, encoding: "utf8", stdio: "pipe", shell: process.platform === "win32" });
  return execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: "utf8", stdio: "pipe" });
};

const log = (msg) => console.log(`• ${msg}`);
let failed = false;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failed = true;
};

try {
  log(`packing into ${work}`);
  const packed = JSON.parse(npm(["pack", "--pack-destination", work, "--json"], repo))[0];
  const files = packed.files.map((f) => f.path);
  check(`tarball ${packed.filename} (${(packed.size / 1024).toFixed(1)} kB, ${files.length} files)`, files.length > 0);
  check("ships bin/amh.mjs", files.includes("bin/amh.mjs"));
  check("ships dist/cli.js", files.includes("dist/cli.js"));
  check("ships adapters/*.json", files.filter((f) => f.startsWith("adapters/")).length >= 7);
  check("ships plugins/dsh", files.includes("plugins/dsh/index.js"));
  check("ships LICENSE", files.includes("LICENSE"));
  check("no sources shipped", !files.some((f) => f.startsWith("src/")));
  check("no tests shipped", !files.some((f) => f.startsWith("test/")));
  check("no node_modules shipped", !files.some((f) => f.startsWith("node_modules/")));

  const unpack = join(work, "unpack");
  mkdirSync(unpack);
  execFileSync("tar", ["-xzf", join(work, packed.filename), "-C", unpack]);
  const pkg = join(unpack, "package");
  check("tarball unpacks to package/", existsSync(join(pkg, "package.json")));

  // the CLI must work from the packaged tree with a throwaway store
  const home = join(work, "home");
  mkdirSync(home);
  const env = { ...process.env, AMH_USER_HOME: home, AMH_HOME: join(home, ".agent-memory-hub") };
  const bin = join(pkg, "bin", "amh.mjs");
  const run = (args) => execFileSync(process.execPath, [bin, ...args], { cwd: home, encoding: "utf8", env });

  check("amh prints help", /amh - shared memory/.test(run([])));
  const detect = run(["detect"]);
  check("detect reads the shipped adapters", detect.includes("claude-code") && detect.includes("workbuddy"), `${detect.split("\n").filter((l) => l.startsWith("[")).length} adapters`);
  run(["add", "--global", "--", "pack smoke test fact"]);
  check("add + list round-trip in a fresh store", run(["list"]).includes("pack smoke test fact"));
  run(["forget", run(["list"]).trim().split(/\s+/)[0]]);
  check("forget tombstones it", !run(["list"]).includes("pack smoke test fact"));

  if (process.env.AMH_SMOKE_INSTALL === "1") {
    const app = join(work, "app");
    mkdirSync(app);
    log("AMH_SMOKE_INSTALL=1 → npm install the tarball into a clean project");
    npm(["init", "-y"], app);
    npm(["install", "--no-audit", "--no-fund", join(work, packed.filename)], app);
    const installed = readdirSync(join(app, "node_modules")).includes("agent-memory-hub");
    check("npm install produced node_modules/agent-memory-hub", installed);
  } else {
    log("skipped the real npm install (set AMH_SMOKE_INSTALL=1 to include it)");
  }

  log(failed ? "finished with failures" : "all good");
} catch (err) {
  failed = true;
  console.error("FAILED:", (err.stdout || "") + (err.stderr || "") || err.message);
} finally {
  rmSync(work, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
