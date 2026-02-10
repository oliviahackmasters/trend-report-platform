export function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const allowOrigin = (allowed.length && allowed.includes(origin)) ? origin : "*";

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Token");
}

export function handleOptions(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

export function requireDemoToken(req, res) {
  const demoToken = process.env.DEMO_TOKEN;
  if (!demoToken) return true;

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (token !== demoToken) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Unauthorized (invalid demo token)." }));
    return false;
  }
  return true;
}
