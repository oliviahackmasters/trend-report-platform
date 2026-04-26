import { deleteObject, listObjects, getJson } from "../lib/r2.js";
import { openai } from "../lib/openaiClient.js";
import { getVectorStores, getVectorStoreIdForSector } from "../lib/vs.js";
import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";


function json(res, status, payload){
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res){
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requireDemoToken(req, res)) return;

  if (req.method !== "POST") return json(res, 405, { error: "Use POST." });

  try{
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const hash = String(body.hash || "").trim();
    if (!hash) return json(res, 400, { error: "Missing hash" });

    const sectorFromBody = String(body.sector || "").trim().toLowerCase();
    const sector = sectorFromBody || "luxury";

    // Find meta blob (support legacy root location and per-sector folders)
    const candidates = [];
    if (sector === "luxury") {
      candidates.push(`trend-library/meta/${hash}.json`);
    }
    candidates.push(`trend-library/meta/${sector}/${hash}.json`);

    let metaBlob = null;
    for (const prefix of candidates) {
      const metas = await listObjects(prefix);
metaBlob = metas[0];
      if (metaBlob) break;
    }

    if (!metaBlob) {
      // Fallback: scan all meta entries for matching hash
      const all = await listObjects("trend-library/meta/");
metaBlob = all.find(b => String(b.key || "").endsWith(`/${hash}.json`));
    }

    if (!metaBlob) return json(res, 404, { error: "Not found" });

    const meta = await getJson(metaBlob.key);

    const metaSector = String(meta.sector || "").trim().toLowerCase() || sector;
    const vsid = getVectorStoreIdForSector(metaSector);
    if (!vsid) return json(res, 500, { error: `Missing vector store ID for sector: ${metaSector}` });

    const vectorStores = getVectorStores(openai);

    // Remove from vector store if we have vsFileId
    if (meta.vsFileId && vectorStores?.files?.del) {
      try { await vectorStores.files.del(vsid, meta.vsFileId); } catch {}
    }

    // (Optional) delete OpenAI file too
    if (meta.openaiFileId) {
      try { await openai.files.del(meta.openaiFileId); } catch {}
    }

    // Delete PDF blob + meta blob
    if (meta.blobUrl) {
      try { await deleteObject(meta.blobUrl); } catch {}
await deleteObject(metaBlob.key);
    }

    return json(res, 200, { ok: true });
  } catch(e){
    return json(res, 500, { error: "DELETE FAILED", details: String(e?.message || e) });
  }
}
