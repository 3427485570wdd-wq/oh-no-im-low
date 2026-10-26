const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const version = require("../package.json").version;
const port = Number(process.env.PORT || 5173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8"
};
const server = http.createServer(async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405); return res.end();
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (pathname.split("/").some(part => part.startsWith("."))) {
      res.writeHead(404); return res.end("Not found");
    }
    let file = path.resolve(root, "." + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403); return res.end("Forbidden");
    }
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, "index.html");
    const data = await fs.readFile(file);
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Content-Length": data.length
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
});
server.on("error", error => {
  console.error(error.code === "EADDRINUSE"
    ? "端口被占用。可用 PORT=5174 npm run dev 换一个端口。" : error.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log("Oh No, I'm Low! · V" + version + "\nLocal: http://127.0.0.1:" + port);
});
