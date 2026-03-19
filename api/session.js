import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";
import { makeSessionToken, getTtlMs } from "../lib/sessionToken.js";
import { getVectorStoreIdForSector } from "../lib/vs.js";

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

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const sector = String(body.sector || "luxury").trim().toLowerCase();
    const vsid = getVectorStoreIdForSector(sector);
    if (!vsid) {
      return json(res, 500, { error: `Missing vector store ID for sector: ${sector}` });
    }

    const createdAt = Date.now();
    const token = makeSessionToken({ vsid, sector, createdAt });

    return json(res, 200, {
      sessionToken: token,
      vectorStoreId: baseId,
      expiresInMs: getTtlMs()
    });
  } catch (err) {
    return json(res, 500, { error: "SESSION FAILED", details: String(err?.message || err) });
  }
}
