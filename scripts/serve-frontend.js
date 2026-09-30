/**
 * Serves the built Angular frontend and the local certificate API.
 *
 * Usage:
 *   npm run dev               # builds/watches Angular on http://localhost:8080
 *   npm start                 # builds and serves the production application
 *
 * Serving over http:// (instead of opening files directly) allows the pages
 * to fetch deployments/CertificateRegistry-ganache.json so the contract
 * address stays in sync after redeployments.
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const store = require("./lib/store");
require("dotenv").config({ quiet: true });
const { verifyRecordTransaction } = require("./lib/chain-record");

const PORT = Number(process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : 8080);
const ROOT = path.resolve(
  __dirname,
  "..",
  process.argv.includes("--dir") ? process.argv[process.argv.indexOf("--dir") + 1] : "dist/certverify/browser"
);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

function readJsonBody(req, res, handle) {
  let size = 0;
  const chunks = [];
  let rejected = false;
  req.on("data", (chunk) => {
    if (rejected) return;
    size += chunk.length;
    if (size > 2 * 1024 * 1024) {
      rejected = true;
      chunks.length = 0;
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Request exceeds the 2 MB limit." }));
      return;
    }
    chunks.push(chunk);
  });
  req.on("error", () => { rejected = true; });
  req.on("end", () => {
    if (rejected) return;
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Request body must be a JSON object.");
      }
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "A valid JSON object is required." }));
      return;
    }
    handle(payload);
  });
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

const server = http.createServer((req, res) => { // NOSONAR -- Central dispatch keeps the API and static-file security checks together.
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(req.headers.host || "")) {
    res.writeHead(403);
    res.end("Use localhost or 127.0.0.1 to access this local server.");
    return;
  }
  // CORS headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath.includes("\0")) throw new Error("URL contains a null byte.");
  } catch {
    res.writeHead(400);
    res.end("Invalid URL");
    return;
  }
  if (req.method === "POST" && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
    res.writeHead(403);
    res.end("Cross-origin writes are not allowed");
    return;
  }

  // API route: store certificate off-chain
  if (req.method === "POST" && urlPath === "/api/store-certificate") {
    readJsonBody(req, res, async (payload) => {
      try {
        const { hash, data } = payload;
        if (!/^0x[0-9a-f]{64}$/i.test(hash || "") || !data || typeof data !== "object" || Array.isArray(data)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "A bytes32 hash and certificate data object are required." }));
          return;
        }
        if (store.exists(hash)) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "A certificate with this hash is already stored." }));
          return;
        }
        const verified = await verifyRecordTransaction(payload);
        const record = store.save(hash, data, verified.txInfo, verified.recordInfo);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, record }));
      } catch (err) {
        res.writeHead(err.statusCode || 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/update-certificate-status") {
    readJsonBody(req, res, async (payload) => {
      try {
        const { hash, status } = payload;
        if (!/^0x[0-9a-f]{64}$/i.test(hash || "") || status !== "revoked") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "A bytes32 hash and confirmed revoked status are required." }));
          return;
        }
        const verified = await verifyRecordTransaction(payload, true);
        const record = store.updateStatus(hash, status, verified.txInfo);
        if (!record) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Certificate record not found." }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, record }));
      } catch (err) {
        res.writeHead(err.statusCode || 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Only GET/HEAD are needed for static files
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }

  // Special route: expose the deployment record so the frontend can auto-sync
  // the contract address after each redeployment (see frontend/config.js).
  // Serve project-root directories that the frontend needs to read
  // (deployments/ for contract address, data/ for off-chain certificates)
  const PASSTHROUGH_DIRS = ["deployments", "data"];
  const matchedDir = PASSTHROUGH_DIRS.find((d) => urlPath.startsWith(`/${d}/`));
  if (matchedDir) {
    const projRoot = path.join(__dirname, "..");
    const filePath2 = path.normalize(path.join(projRoot, urlPath));
    if (!isWithin(path.join(projRoot, matchedDir), filePath2)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }
    fs.readFile(filePath2, (err2, data2) => {
      if (err2) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end(`404 Not Found: ${urlPath}`);
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(filePath2).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : data2);
    });
    return;
  }

  const appRoutes = ["/", "/index.html", "/issuer", "/issuer/", "/verify", "/verify/", "/issuer.html", "/verifier.html"];
  let filePath = path.normalize(path.join(ROOT, appRoutes.includes(urlPath) ? "index.html" : urlPath));

  // Prevent path traversal outside the frontend directory
  if (!isWithin(ROOT, filePath)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) filePath = path.join(filePath, "index.html");

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end(`404 Not Found: ${urlPath}`);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "no-store", // always fresh during development
      });
      res.end(req.method === "HEAD" ? undefined : data);
    });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  const port = server.address().port;
  console.log("Frontend server running:");
  console.log(`  Issuer dashboard:  http://localhost:${port}/issuer.html`);
  console.log(`  Verify page:       http://localhost:${port}/verifier.html`);
  console.log(`  Home:              http://localhost:${port}/`);
  console.log(`\nServing from: ${ROOT}`);
  console.log("Press Ctrl+C to stop.");
});
