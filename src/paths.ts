import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** AMH_USER_HOME lets tests (or sandboxes) redirect "~" without touching the real home. */
export function userHome(): string {
  return process.env.AMH_USER_HOME ?? homedir();
}

export function dataDir(): string {
  return process.env.AMH_HOME ?? join(userHome(), ".agent-memory-hub");
}

/** "~/x" -> home; relative paths resolve against projectDir (or cwd). */
export function expand(p: string, projectDir?: string): string {
  if (p === "~") return userHome();
  if (p.startsWith("~/")) return join(userHome(), p.slice(2));
  return resolve(projectDir ?? process.cwd(), p);
}

export function projectScope(dir: string): string {
  return "project:" + resolve(dir);
}
