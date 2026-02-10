import { openai } from "../lib/openaiClient.js";
import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";
import { makeSessionToken, getTtlMs } from "../lib/sessionToken.js";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  setCors(req, res);

  try {
    if (handleOptions(req, res)) return;
    if (!requireDemoToken(req, res)) return;

    if (req.method !== "POST") return json(res, 405, { error: "Use POST." });

    // --- DIAGNOSTICS ---
    const hasKey = !!process.env.OPENAI_API_KEY;
    const hasVSsnake = !!openai?.vector_stores;
    const hasVScamel = !!openai?.vectorStores;

    if (!hasKey) {
      return json(res, 500, { error: "SESSION FAILED", details: "Missing OPENAI_API_KEY in this Vercel project." });
    }

    // Pick whichever exists
    const vectorStores = openai.vectorStores || openai.vector_stores;

    if (!vectorStores?.create) {
      return json(res, 500, {
        error: "SESSION FAILED",
        details: "Vector stores API missing on OpenAI client in this runtime.",
        debug: { hasVSsnake, hasVScamel, openaiKeys: Object.keys(openai || {}) }
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const title = String(body.title || "Trend Reports Session").slice(0, 80);

    const vs = await vectorStores.create({ name: title });

    const createdAt = Date.now();
    const token = makeSessionToken({ vsid: vs.id, createdAt });

    return json(res, 200, {
      sessionToken: token,
      vectorStoreId: vs.id,
      expiresInMs: getTtlMs()
    });
  } catch (err) {
    return json(res, 500, { error: "SESSION FAILED", details: String(err?.message || err) });
  }
}
