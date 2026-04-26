export function setCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-session-token, x-demo-token"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

export function handleOptions(req, res) {
  if (req.method === "OPTIONS") {
    setCors(req, res);
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

export function requireDemoToken(req, res) {
  const required = process.env.DEMO_TOKEN;

  if (!required) return true;

  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const demoHeader = req.headers["x-demo-token"] || "";

  if (bearer === required || demoHeader === required) {
    return true;
  }

  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Unauthorized" }));
  return false;
}