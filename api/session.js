import { openai } from "../lib/openaiClient.js";
import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";
import { makeSessionToken, getTtlMs } from "../lib/sessionToken.js";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  // ALWAYS set CORS first
  setCors(req, res);

  try {
    if (handleOptions(req, res)) return;
    if (!requireDemoToken(req, res)) return;

    if (req.method !== "POST") {
      return json(res, 405, { error: "Use POST." });
    }

    // sanity check env early so you get a readable error
    if (!process.env.OPENAI_API_KEY) {
      return json(res, 500, { error: "Missing OPENAI_API_KEY in Vercel env vars." });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const title = String(body.title || "Trend Reports Session").slice(0, 80);

    // Create vector store
    const vs = await openai.vector_stores.create({ name: title });

    const createdAt = Date.now();
    const token = makeSessionToken({ vsid: vs.id, createdAt });

    return json(res, 200, {
      sessionToken: token,
      vectorStoreId: vs.id,
      expiresInMs: getTtlMs()
    });
  } catch (err) {
    // CORS already set; return details so browser can read them
    return json(res, 500, {
      error: "SESSION FAILED",
      details: String(err?.message || err)
    });
  }
}
