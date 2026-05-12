import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { fileExists } from "./lib/fs.mjs";
import { paths } from "./lib/paths.mjs";

const port = Number(process.env.PORT || 5173);

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".xml") return "application/xml; charset=utf-8";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".webp") return "image/webp";
  if (ext === ".pdf") return "application/pdf";
  return "application/octet-stream";
}

function filePathForRequest(urlPath) {
  const clean = urlPath.split("?")[0].split("#")[0];
  const rel = decodeURIComponent(clean).replace(/^\//, "");
  if (!rel) return path.join(paths.docsDir, "index.html");
  if (rel.endsWith(".html") || rel.includes(".")) return path.join(paths.docsDir, rel);
  return path.join(paths.docsDir, rel, "index.html");
}

const server = http.createServer(async (req, res) => {
  const filePath = filePathForRequest(req.url || "/");
  const exists = await fileExists(filePath);
  const finalPath = exists ? filePath : path.join(paths.docsDir, "404.html");
  try {
    const data = await fs.readFile(finalPath);
    res.statusCode = exists ? 200 : 404;
    res.setHeader("Content-Type", contentType(finalPath));
    res.end(data);
  } catch {
    res.statusCode = 500;
    res.end("Server error");
  }
});

server.listen(port, () => {
  console.log(`Serving ${paths.docsDir} on http://localhost:${port}`);
});

