import { list } from "@vercel/blob";
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

  if (req.method !== "GET") return json(res, 405, { error: "Use GET." });

  try{
    const metas = await list({ prefix: "trend-library/meta/" });
    const items = [];

    for (const b of metas.blobs || []) {
      const r = await fetch(b.url);
      const meta = await r.json().catch(()=>null);
      if (meta) items.push(meta);
    }

    items.sort((a,b) => String(b.addedAt||"").localeCompare(String(a.addedAt||"")));

    return json(res, 200, { items });
  } catch(e){
    return json(res, 500, { error: "LIBRARY FAILED", details: String(e?.message || e) });
  }
}
