import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";
import { makeSessionToken, getTtlMs } from "../lib/sessionToken.js";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

const allowedOrigins = [
  'https://www.hackmasters.co.uk',
  'https://hackmasters.co.uk'
];

function corsHeaders(req) {
  const origin = req.headers.origin;
  const allowedOrigin = allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}


export default async function handler(req, res) {
setCors(req, res);
if (handleOptions(req, res)) return;
if (!requireDemoToken(req, res)) return;

  try {
    if (handleOptions(req, res)) return;
    if (!requireDemoToken(req, res)) return;

    if (req.method !== "POST") return json(res, 405, { error: "Use POST." });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

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
