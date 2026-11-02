import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

export async function startStaticFixtureServer(rootPath, fallbackFile = "index.html") {
  const fixtureRoot = resolve(rootPath);
  const fallbackPath = resolve(fixtureRoot, fallbackFile);
  const prefix = `${fixtureRoot}${sep}`;
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const requested = resolve(fixtureRoot, `.${decodeURIComponent(requestUrl.pathname)}`);
    const candidate = requested.startsWith(prefix) && existsSync(requested) && statSync(requested).isFile()
      ? requested
      : fallbackPath;
    if (!candidate.startsWith(prefix) || !existsSync(candidate)) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.setHeader("Content-Type", contentTypes.get(extname(candidate)) ?? "application/octet-stream");
    response.end(readFileSync(candidate));
  });
  await new Promise((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveReady);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server failed to bind");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}
