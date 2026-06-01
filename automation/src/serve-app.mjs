import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const root = path.resolve("../app/dist");
const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "5173", 10);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);

function resolveRequestPath(requestUrl = "/") {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const normalized = path.normalize(decodeURIComponent(url.pathname));
  const relative = normalized === "/" ? "index.html" : normalized.replace(/^\/+/, "");
  const filePath = path.resolve(root, relative);
  if (!filePath.startsWith(root)) throw new Error("Invalid path");
  return filePath;
}

const server = http.createServer(async (request, response) => {
  try {
    let filePath = resolveRequestPath(request.url);
    let content;

    try {
      content = await fs.readFile(filePath);
    } catch {
      filePath = path.join(root, "index.html");
      content = await fs.readFile(filePath);
    }

    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(filePath)) ?? "application/octet-stream",
    });
    response.end(content);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Server error");
  }
});

server.listen(port, host, () => {
  console.log(`Finanztool app läuft auf http://localhost:${port}/`);
});
