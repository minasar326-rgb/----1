import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const STUDENTS_FILE = path.join(DATA_DIR, "students.json");
const ATTENDANCE_FILE = path.join(DATA_DIR, "attendance.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  // CORS & Security Headers
  const securityHeaders = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=*, microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob: data:; img-src 'self' data: blob: https:; font-src 'self' https: data:; connect-src *; worker-src blob: 'self';",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, securityHeaders);
    res.end();
    return;
  }

  const urlPath = req.url.split("?")[0];

  // 1. Local Wi-Fi Sync API: Students
  if (urlPath === "/api/sync/students") {
    if (req.method === "GET") {
      let data = "[]";
      if (fs.existsSync(STUDENTS_FILE)) {
        try { data = fs.readFileSync(STUDENTS_FILE, "utf8") || "[]"; } catch(e){}
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...securityHeaders });
      res.end(data);
      return;
    } else if (req.method === "POST") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        try {
          JSON.parse(body); // validate
          fs.writeFileSync(STUDENTS_FILE, body, "utf8");
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...securityHeaders });
          res.end(JSON.stringify({ success: true, count: JSON.parse(body).length }));
        } catch(err) {
          res.writeHead(400, { "Content-Type": "application/json", ...securityHeaders });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
  }

  // 2. Local Wi-Fi Sync API: Attendance
  if (urlPath === "/api/sync/attendance") {
    if (req.method === "GET") {
      let data = "[]";
      if (fs.existsSync(ATTENDANCE_FILE)) {
        try { data = fs.readFileSync(ATTENDANCE_FILE, "utf8") || "[]"; } catch(e){}
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...securityHeaders });
      res.end(data);
      return;
    } else if (req.method === "POST") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        try {
          JSON.parse(body);
          fs.writeFileSync(ATTENDANCE_FILE, body, "utf8");
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...securityHeaders });
          res.end(JSON.stringify({ success: true }));
        } catch(err) {
          res.writeHead(400, { "Content-Type": "application/json", ...securityHeaders });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
  }

  // 3. Static Files Serving
  let reqPath = decodeURI(urlPath);
  if (reqPath === "/") reqPath = "/index.html";

  // Prevent directory traversal attacks
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 
        "Content-Type": "text/html; charset=utf-8",
        ...securityHeaders 
      });
      res.end(`<h2>404 Not Found</h2><p>الملف غير موجود: ${reqPath}</p>`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      ...securityHeaders
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🛡️ Server is running live on port ${PORT}`);
  console.log(`💻 Local Laptop: http://localhost:${PORT}/dashboard.html`);
  console.log(`📱 Phones on same Wi-Fi: http://192.168.100.15:${PORT}/dashboard.html\n`);
});
