export function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  // If allowlist set: only echo allowed origins.
  // If no allowlist set: echo whatever origin we received (best for Squarespace embeds).
  const allowOrigin =
    allowed.length > 0
      ? (allowed.includes(origin) ? origin : allowed[0])
      : origin;

  res.setHeader("Access-Control-Allow-Origin", allowOrigin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-session-token"
  );
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
