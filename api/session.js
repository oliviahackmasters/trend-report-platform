import { openai } from "../lib/openaiClient.js";
import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";
import { makeSessionToken, getTtlMs } from "../lib/sessionToken.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requireDemoToken(req, res)) return;

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Use POST." }));
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const title = String(body.title || "Trend Reports Session").slice(0, 80);

  const vs = await openai.vector_stores.create({ name: title });

  const createdAt = Date.now();
  const token = makeSessionToken({ vsid: vs.id, createdAt });

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({
    sessionToken: token,
    vectorStoreId: vs.id,
    expiresInMs: getTtlMs()
  }));
}
