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

    const baseId = process.env.BASE_VECTOR_STORE_ID;
    if (!baseId) {
      return json(res, 500, { error: "Missing BASE_VECTOR_STORE_ID" });
    }

    const createdAt = Date.now();
    const token = makeSessionToken({ vsid: baseId, createdAt });

    return json(res, 200, {
      sessionToken: token,
      vectorStoreId: baseId,
      expiresInMs: getTtlMs()
    });
  } catch (err) {
    return json(res, 500, { error: "SESSION FAILED", details: String(err?.message || err) });
  }
}
