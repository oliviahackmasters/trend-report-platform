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
    const base = req.headers.host ? `http://${req.headers.host}` : "http://localhost";
    const url = new URL(req.url, base);
    const sector = String(url.searchParams.get("sector") || "luxury").trim().toLowerCase();

    const items = [];

    // List from sector-specific prefix (+ legacy root for luxury)
    const prefixes = sector === "luxury" 
      ? ["trend-library/meta/luxury/", "trend-library/meta/"]  // check migrated + legacy
      : [`trend-library/meta/${sector}/`];  // only check sector folder

    for (const prefix of prefixes) {
      const metas = await list({ prefix });
      for (const b of metas.blobs || []) {
        const r = await fetch(b.url);
        const meta = await r.json().catch(()=>null);
        if (!meta) continue;
        
        // De-duplicate by hash
        if (!items.find(x => x.hash === meta.hash)) {
          items.push(meta);
        }
      }
    }

    items.sort((a,b) => String(b.addedAt||"").localeCompare(String(a.addedAt||"")));

    return json(res, 200, { items });
  } catch(e){
    return json(res, 500, { error: "LIBRARY FAILED", details: String(e?.message || e) });
  }
}
