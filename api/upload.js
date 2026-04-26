import Busboy from "busboy";
import { put } from "@vercel/blob";
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

  if (req.method !== "POST") return json(res, 405, { error: "Use POST." });

  try {
    const bb = Busboy({ headers: req.headers });
    let fileBuffer = null;
    let filename = null;

    bb.on("file", (fieldname, file, info) => {
      if (fieldname !== "file") return;
      filename = info.filename;
      const chunks = [];
      file.on("data", (chunk) => chunks.push(chunk));
      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on("finish", async () => {
      if (!fileBuffer || !filename) {
        return json(res, 400, { error: "No file uploaded" });
      }

      try {
        const blob = await put(filename, fileBuffer, {
          access: "public",
          addRandomSuffix: true,
        });

        return json(res, 200, { blobUrl: blob.url, key: blob.pathname });
      } catch (e) {
        return json(res, 500, { error: "BLOB UPLOAD FAILED", details: e.message });
      }
    });

    req.pipe(bb);
  } catch (e) {
    return json(res, 500, { error: "UPLOAD FAILED", details: e.message });
  }
}