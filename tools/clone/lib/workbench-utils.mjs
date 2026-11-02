import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

export function fail(message) {
  throw new Error(message);
}

export function validateSiteId(value) {
  if (!value || !/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    fail("site id must use lowercase letters, numbers, and hyphens");
  }
  return value;
}

export function parseCli(argv) {
  // pnpm may insert `--` after a script-owned subcommand. Treat every standalone
  // separator as transport syntax so options after it retain their meaning.
  const values = argv.filter((value) => value !== "--");
  const positionals = [];
  const options = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const equals = value.indexOf("=");
    if (equals > 2) {
      options.set(value.slice(2, equals), value.slice(equals + 1));
      continue;
    }
    const name = value.slice(2);
    const next = values[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(name, next);
      index += 1;
    } else {
      options.set(name, true);
    }
  }
  return { options, positionals };
}

export function option(options, name, fallback = undefined) {
  return options.has(name) ? options.get(name) : fallback;
}

export function ensureDirectory(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  ensureDirectory(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function loadLocalEnvironment(workspaceRoot = repoRoot) {
  for (const name of [".env", ".env.local"]) {
    const path = resolve(workspaceRoot, name);
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, "utf8").split(/\r?\n/u);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const equals = trimmed.indexOf("=");
      if (equals < 1) continue;
      const key = trimmed.slice(0, equals).trim();
      let value = trimmed.slice(equals + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export function workspaceCacheRoot(workspaceRoot = repoRoot) {
  const configured = process.env.WORKBENCH_CACHE_DIR || ".workbench/cache";
  return resolve(workspaceRoot, configured);
}

export function relativePath(workspaceRoot, path) {
  return relative(workspaceRoot, path).split("\\").join("/");
}
