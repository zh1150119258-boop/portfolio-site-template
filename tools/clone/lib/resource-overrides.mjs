import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

import { repoRoot } from "./workbench-utils.mjs";

const mimeTypes = new Map([
  [".glb", "model/gltf-binary"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

export function validatedResourceOverrides(entries = []) {
  if (!Array.isArray(entries)) throw new Error("resourceOverrides must be an array");
  return entries.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("resource override must be an object");
    const url = new URL(entry.url);
    if (url.protocol !== "https:") throw new Error("resource override URL must use https");
    if (typeof entry.localPath !== "string" || !entry.localPath.trim()) throw new Error("resource override requires localPath");
    const localPath = resolve(repoRoot, entry.localPath);
    if (!localPath.startsWith(`${repoRoot}/`) || !existsSync(localPath)) throw new Error(`resource override is outside the repository or missing: ${entry.localPath}`);
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? "")) throw new Error("resource override requires a lowercase SHA-256 digest");
    const body = readFileSync(localPath);
    const digest = createHash("sha256").update(body).digest("hex");
    if (digest !== entry.sha256) throw new Error(`resource override SHA-256 mismatch: ${relative(repoRoot, localPath)}`);
    return {
      body,
      contentType: entry.contentType ?? mimeTypes.get(extname(localPath).toLowerCase()) ?? "application/octet-stream",
      localPath,
      url: url.href,
    };
  });
}

export function validatedEvidenceFile(entry, label = "evidence file") {
  if (!entry || typeof entry !== "object" || typeof entry.localPath !== "string") throw new Error(`${label} requires localPath`);
  const localPath = resolve(repoRoot, entry.localPath);
  if (!localPath.startsWith(`${repoRoot}/`) || !existsSync(localPath)) throw new Error(`${label} is outside the repository or missing: ${entry.localPath}`);
  if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? "")) throw new Error(`${label} requires a lowercase SHA-256 digest`);
  const body = readFileSync(localPath);
  const digest = createHash("sha256").update(body).digest("hex");
  if (digest !== entry.sha256) throw new Error(`${label} SHA-256 mismatch: ${relative(repoRoot, localPath)}`);
  return { body, localPath };
}

export async function installResourceOverrides(context, entries = []) {
  const overrides = validatedResourceOverrides(entries);
  for (const entry of overrides) {
    await context.route(entry.url, (route) => route.fulfill({
      body: entry.body,
      contentType: entry.contentType,
      headers: { "cache-control": "public, max-age=31536000, immutable" },
      status: 200,
    }));
  }
  return overrides.map((entry) => ({ localPath: relative(repoRoot, entry.localPath), url: entry.url }));
}
