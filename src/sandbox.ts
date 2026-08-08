import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { execSync } from "node:child_process";
import type { SandboxConfig, SandboxHandle } from "./types.js";

export function defineSandbox(config: SandboxConfig = {}): SandboxConfig {
  return {
    backend: config.backend ?? "local",
    root: config.root,
    allowNetwork: config.allowNetwork ?? false,
    bootstrap: config.bootstrap ?? [],
  };
}

export function createSandbox(
  agentRoot: string,
  config: SandboxConfig,
): SandboxHandle {
  const root = resolve(agentRoot, config.root ?? ".helix/sandbox");
  mkdirSync(root, { recursive: true });

  for (const item of config.bootstrap ?? []) {
    const target = safeJoin(root, item);
    mkdirSync(dirname(target), { recursive: true });
    if (!existsSync(target)) writeFileSync(target, "");
  }

  if (config.backend === "none") {
    return {
      root,
      readFile: () => {
        throw new Error("Sandbox disabled");
      },
      writeFile: () => {
        throw new Error("Sandbox disabled");
      },
      list: () => [],
      exec: () => ({ stdout: "", stderr: "Sandbox disabled", exitCode: 1 }),
    };
  }

  return {
    root,
    readFile(path: string) {
      return readFileSync(safeJoin(root, path), "utf8");
    },
    writeFile(path: string, contents: string) {
      const full = safeJoin(root, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, contents);
    },
    list(path = ".") {
      const full = safeJoin(root, path);
      if (!existsSync(full)) return [];
      return walk(full, root);
    },
    exec(command: string) {
      // Intentionally constrained local sandbox: no shell metacharacters.
      if (/[;&|`$<>]/.test(command)) {
        return {
          stdout: "",
          stderr: "Command rejected by sandbox policy",
          exitCode: 126,
        };
      }
      try {
        const stdout = execSync(command, {
          cwd: root,
          encoding: "utf8",
          timeout: 10_000,
          stdio: ["ignore", "pipe", "pipe"],
        });
        return { stdout, stderr: "", exitCode: 0 };
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; status?: number };
        return {
          stdout: e.stdout ?? "",
          stderr: e.stderr ?? (err instanceof Error ? err.message : String(err)),
          exitCode: e.status ?? 1,
        };
      }
    },
  };
}

function safeJoin(root: string, path: string): string {
  const full = resolve(root, path);
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(`Sandbox path escapes root: ${path}`);
  }
  return full;
}

function walk(dir: string, root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = full.slice(root.length + 1);
    out.push(rel);
    if (statSync(full).isDirectory()) out.push(...walk(full, root));
  }
  return out;
}
