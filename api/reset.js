import { openai } from "../lib/openaiClient.js";
import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";
import { readSessionToken } from "../lib/sessionToken.js";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requireDemoToken(req, res)) return;

  if (req.method !== "POST") return json(res, 405, { error: "Use POST." });

  const token = req.headers["x-session-token"];
  const session = readSessionToken(token);
  if (!session?.vsid) return json(res, 400, { error: "Missing/invalid session token." });

  try {
    await openai.vector_stores.del(session.vsid);
    return json(res, 200, { ok: true });
  } catch (err) {
    return json(res, 500, { error: "Reset failed", details: String(err?.message || err) });
  }
}
