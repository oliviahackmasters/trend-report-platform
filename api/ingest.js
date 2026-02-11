import fs from "fs";
import os from "os";
import path from "path";
import fetch from "node-fetch";

import { openai } from "../lib/openaiClient.js";
import { getVectorStores } from "../lib/vs.js";
import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requireDemoToken(req, res)) return;

  if (req.method !== "POST") {
    return json(res, 405, { error: "Use POST" });
  }

  const body = typeof req.body === "string"
    ? JSON.parse(req.body)
    : req.body;

  const blobUrl = body?.blobUrl;

  if (!blobUrl) {
    return json(res, 400, { error: "Missing blobUrl" });
  }

  const vectorStores = getVectorStores(openai);

  const vsid = process.env.BASE_VECTOR_STORE_ID;
  if (!vsid) {
    return json(res, 500, { error: "Missing BASE_VECTOR_STORE_ID" });
  }

  try {
    // Download Blob file into temp storage
    const tmpPath = path.join(os.tmpdir(), `upload-${Date.now()}.pdf`);

    const resp = await fetch(blobUrl);
    const buffer = await resp.arrayBuffer();
    fs.writeFileSync(tmpPath, Buffer.from(buffer));

    // Upload file into OpenAI
    const createdFile = await openai.files.create({
      file: fs.createReadStream(tmpPath),
      purpose: "assistants"
    });

    // Attach into baseline vector store
    await vectorStores.files.create(vsid, {
      file_id: createdFile.id
    });

    fs.unlinkSync(tmpPath);

    return json(res, 200, {
      ok: true,
      fileId: createdFile.id
    });

  } catch (err) {
    return json(res, 500, {
      error: "Ingest failed",
      details: String(err.message || err)
    });
  }
}
