import { del, list } from "@vercel/blob";
import { openai } from "../lib/openaiClient.js";
import { getVectorStores } from "../lib/vs.js";
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

    // Find meta blob
    const metaPrefix = `trend-library/meta/${hash}.json`;
    const metas = await list({ prefix: metaPrefix });
    const metaBlob = (metas.blobs || [])[0];
    if (!metaBlob) return json(res, 404, { error: "Not found" });

    const metaResp = await fetch(metaBlob.url);
    const meta = await metaResp.json();

    const vsid = process.env.BASE_VECTOR_STORE_ID;
    if (!vsid) return json(res, 500, { error: "Missing BASE_VECTOR_STORE_ID" });

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
      try { await del(meta.blobUrl); } catch {}
    }
    await del(metaBlob.url);

    return json(res, 200, { ok: true });
  } catch(e){
    return json(res, 500, { error: "DELETE FAILED", details: String(e?.message || e) });
  }
}
