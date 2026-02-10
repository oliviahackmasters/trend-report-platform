import { openai } from "../lib/openaiClient.js";
import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";
import { makeSessionToken, getTtlMs } from "../lib/sessionToken.js";

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requireDemoToken(req, res)) return;

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Use POST." }));
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const title = (body.title || "Trend Reports Session").slice(0, 80);

  // Create vector store (managed retrieval index)
  const vs = await openai.vector_stores.create({ name: title }); :contentReference[oaicite:2]{index=2}

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
