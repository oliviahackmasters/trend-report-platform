import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { put, list } from "@vercel/blob";

import { openai } from "../lib/openaiClient.js";
import { getVectorStores } from "../lib/vs.js";
import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";

function json(res, status, payload){
  res.statusCode = status;
  res.setHeader("Content-Type","application/json");
  res.end(JSON.stringify(payload));
}

function guessYear(filename){
  const m = String(filename||"").match(/(20\d{2})/);
  return m ? m[1] : "";
}

export default async function handler(req, res){
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requireDemoToken(req, res)) return;

  if (req.method !== "POST") return json(res, 405, { error:"Use POST" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const blobUrl = body.blobUrl;
  const filename = body.filename || "report.pdf";
  const pathname = body.pathname || "";
  const size = Number(body.size || 0);
  const tagsIn = body.tags || {};

  if (!blobUrl) return json(res, 400, { error:"Missing blobUrl" });

  const vsid = process.env.BASE_VECTOR_STORE_ID;
  if (!vsid) return json(res, 500, { error:"Missing BASE_VECTOR_STORE_ID" });

  try{
    // Download blob
    const resp = await fetch(blobUrl);
    if (!resp.ok) throw new Error("Could not fetch blob: " + resp.status);

    const buf = Buffer.from(await resp.arrayBuffer());

    // Hash for duplicates
    const hash = crypto.createHash("sha256").update(buf).digest("hex");

    // If metadata exists, treat as duplicate and stop
    const metaKey = `trend-library/meta/${hash}.json`;
    const existing = await list({ prefix: metaKey });
    if ((existing.blobs || []).length) {
      return json(res, 200, {
        ok: true,
        duplicate: true,
        hash
      });
    }

    // Write temp file for OpenAI upload
    const tmpPath = path.join(os.tmpdir(), `ingest-${Date.now()}.pdf`);
    fs.writeFileSync(tmpPath, buf);

    // Upload to OpenAI
    const createdFile = await openai.files.create({
      file: fs.createReadStream(tmpPath),
      purpose: "assistants"
    });

    // Attach to vector store
    const vectorStores = getVectorStores(openai);
    const vsFile = await vectorStores.files.create(vsid, { file_id: createdFile.id });

    fs.unlinkSync(tmpPath);

    // Normalize tags
    const year = (tagsIn.year || guessYear(filename)).trim();
    const company = String(tagsIn.company || "").trim();
    const topics = Array.isArray(tagsIn.topics) ? tagsIn.topics : [];
    const addedAt = new Date().toISOString();

    // Persist metadata as a blob JSON
    const meta = {
      hash,
      filename,
      pathname,
      blobUrl,
      size,
      addedAt,
      tags: { year, company, topics },
      openaiFileId: createdFile.id,
      vsFileId: vsFile?.id || null
    };

    await put(metaKey, JSON.stringify(meta, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false
    });

    return json(res, 200, { ok:true, hash, duplicate:false });
  } catch(e){
    return json(res, 500, { error:"INGEST FAILED", details: String(e?.message || e) });
  }
}
