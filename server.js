#!/usr/bin/env node
/**
 * 黛云丝绸 — 零依赖静态预览服务器
 * 用法：node server.js  或  npm start
 * 端口：环境变量 PORT，默认 8080
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (urlPath === "/") urlPath = "/index.html";

    // 防目录穿越
    const filePath = path.join(ROOT, path.normalize(urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("404 Not Found");
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(data);
    });
  } catch (e) {
    res.writeHead(500);
    res.end("Server Error");
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    const next = Number(server.__port || PORT) + 1;
    console.warn(`  端口 ${server.__port || PORT} 已被占用，尝试 ${next} …`);
    if (next - Number(PORT) > 10) {
      console.error("  连续多个端口均被占用，请用 PORT=端口 npm start 手动指定。");
      process.exit(1);
    }
    server.__port = next;
    setTimeout(() => server.listen(next, HOST), 150);
  } else {
    throw err;
  }
});

server.on("listening", () => {
  const a = server.address();
  const port = typeof a === "object" && a ? a.port : PORT;
  console.log(`\n  黛云丝绸预览已启动`);
  console.log(`  ➜  本地:   http://localhost:${port}`);
  console.log(`  ➜  网络:   http://${HOST}:${port}\n`);
});

server.__port = PORT;
server.listen(PORT, HOST);
