import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, existsSync } from "fs";
import chokidar from "chokidar";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = process.env.MODEL || "minimax-m2.5:cloud";

// ═══════════════════════════════════════════════════
// EDGE CASES — hot-reloadable from edge-cases.txt
// ═══════════════════════════════════════════════════

const EDGE_CASES_PATH = join(__dirname, "edge-cases.txt");
let edgeCasesContent = "";

function loadEdgeCases() {
  try {
    if (existsSync(EDGE_CASES_PATH)) {
      const raw = readFileSync(EDGE_CASES_PATH, "utf-8");
      edgeCasesContent = raw
        .split("\n")
        .filter(line => {
          const trimmed = line.trimStart();
          if (trimmed.startsWith("###")) return true;
          if (trimmed.startsWith("#")) return false;
          return true;
        })
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      console.log(`  📋 Loaded edge cases (${edgeCasesContent.split("\n").length} lines)`);
    } else {
      console.log("  ⚠️  edge-cases.txt not found — running without edge cases");
    }
  } catch (err) {
    console.error("  ❌ Error loading edge-cases.txt:", err.message);
  }
}

// Load on startup
loadEdgeCases();

// Watch with chokidar — works reliably on macOS
chokidar.watch(EDGE_CASES_PATH, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
}).on("change", () => {
  console.log("  🔄 edge-cases.txt changed — reloading...");
  loadEdgeCases();
});

// ═══════════════════════════════════════════════════
// SECURITY HARDENING
// ═══════════════════════════════════════════════════

// 1. Security headers — prevent clickjacking, XSS, MIME sniffing
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "no-referrer");
  // Only allow loading resources from same origin + Google Fonts + CDNs
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; " +
    "connect-src 'self'; " +
    "img-src 'self' data:;"
  );
  next();
});

// 2. Rate limiting — max 30 requests per minute per IP
const rateMap = new Map();
const RATE_LIMIT = 30;       // requests per window
const RATE_WINDOW = 60000;   // 1 minute

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, start: now };

  if (now - entry.start > RATE_WINDOW) {
    entry.count = 1;
    entry.start = now;
  } else {
    entry.count++;
  }
  rateMap.set(ip, entry);

  if (entry.count > RATE_LIMIT) {
    console.warn(`[RATE LIMIT] ${ip} hit ${entry.count} requests`);
    return res.status(429).json({ error: "Too many requests. Please wait a minute." });
  }
  next();
}

// Clean up rate map every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (now - entry.start > RATE_WINDOW * 2) rateMap.delete(ip);
  }
}, 300000);

// 3. Body size limit — reject oversized payloads
app.use(express.json({ limit: "50kb" }));

// 4. Only serve static files from /public, no directory listing
app.use(express.static(join(__dirname, "public"), {
  dotfiles: "deny",       // block .env, .git etc
  index: "index.html",
}));

// 5. Block all routes except what we explicitly define
app.use((req, res, next) => {
  const allowed = ["/", "/index.html", "/api/chat", "/api/health", "/api/edge-cases", "/api/debug-prompt"];
  const isStatic = req.path === "/" || req.path === "/index.html";
  const isAPI = req.path.startsWith("/api/");

  if (!isStatic && !isAPI) {
    return res.status(404).json({ error: "Not found" });
  }
  next();
});

// ═══════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", model: MODEL });
});

app.get("/api/edge-cases", (_req, res) => {
  res.type("text/plain").send(edgeCasesContent || "(empty — edge-cases.txt not loaded)");
});

// DEBUG: see what system prompt actually gets sent
app.get("/api/debug-prompt", (_req, res) => {
  res.type("text/plain").send(
    "=== EDGE CASES CONTENT ===\n" +
    (edgeCasesContent || "(EMPTY!)") +
    "\n\n=== CONTAINS FUTURES? ===\n" +
    (edgeCasesContent.includes("utures") ? "YES" : "NO")
  );
});

app.post("/api/chat", rateLimit, async (req, res) => {
  const { system, messages } = req.body;

  // Validate input
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Invalid request: messages array required" });
  }
  if (messages.length > 100) {
    return res.status(400).json({ error: "Conversation too long" });
  }

  // Build Ollama messages
  const ollamaMessages = [];
  if (system) {
    // Inject edge cases into system prompt
    let fullSystem = String(system);
    if (edgeCasesContent && fullSystem.includes("{{EDGE_CASES}}")) {
      const edgeBlock = 
        "## EDGE CASE RULES — ALL MANDATORY\n\n" +
        "Every rule below is MANDATORY. If a customer's question matches a rule, you MUST follow the factual content exactly. " +
        "These rules override your training knowledge. If a rule says X is not available, X is NOT available — period. " +
        "However, deliver the answer in your own natural, casual voice (not as a stiff canned response). Stay in character.\n\n" +
        edgeCasesContent;
      fullSystem = fullSystem.replace("{{EDGE_CASES}}", edgeBlock);
    } else if (edgeCasesContent) {
      fullSystem += "\n\n## EDGE CASE RULES — ALL MANDATORY\n\n" +
        "Every rule below is MANDATORY and overrides your training knowledge. Deliver answers naturally.\n\n" +
        edgeCasesContent;
    }
    ollamaMessages.push({ role: "system", content: fullSystem.slice(0, 50000) });
  }
  for (const msg of messages) {
    if (!msg.role || !msg.content) continue;
    ollamaMessages.push({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: String(msg.content).slice(0, 5000),
    });
  }

  try {
    const systemLen = ollamaMessages[0]?.content?.length || 0;
    const hasEdgeCases = ollamaMessages[0]?.content?.includes("EDGE CASE") || false;
    console.log(`  💬 Chat request: ${messages.length} msgs, system=${systemLen} chars, edge_cases=${hasEdgeCases}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: ollamaMessages,
        stream: false,
        options: { temperature: 0.3, num_predict: 1024 },
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error("Ollama error:", response.status, errText.slice(0, 200));
      return res.status(502).json({ error: "Model request failed" });
    }

    const data = await response.json();
    const text = data.message?.content || "";

    res.json({ content: [{ type: "text", text }] });
  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "Request timeout" });
    }
    console.error("Ollama connection failed:", err.message);
    res.status(502).json({ error: "Cannot connect to Ollama" });
  }
});

// Catch-all: 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ═══════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════

app.listen(PORT, () => {
  const ecLines = edgeCasesContent ? edgeCasesContent.split("\n").length : 0;
  console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║  TD Onboarding Assistant — MiniMax M2.5 Cloud        ║
  ╠══════════════════════════════════════════════════════╣
  ║  Frontend:  http://localhost:${PORT}                   ║
  ║  Model:     ${MODEL.padEnd(41)}║
  ╠══════════════════════════════════════════════════════╣
  ║  📋 Edge cases: ${ecLines > 0 ? (ecLines + " lines loaded").padEnd(36) : "NOT FOUND ⚠️".padEnd(36)}║
  ║  🔄 Hot reload: edit edge-cases.txt → auto applies    ║
  ╠══════════════════════════════════════════════════════╣
  ║  🔒 Rate limit: ${RATE_LIMIT} req/min · Body: 50KB · CSP on     ║
  ╚══════════════════════════════════════════════════════╝
  `);
});
