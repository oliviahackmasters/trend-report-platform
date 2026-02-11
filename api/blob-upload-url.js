import { handleUpload } from "@vercel/blob/client";
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
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname /*, clientPayload */) => {
        return {
          // PDFs only
          allowedContentTypes: ["application/pdf"],
          // Avoid collisions
          addRandomSuffix: true,
          // IMPORTANT:
          // Use "public" so your server can fetch the blob by URL to ingest into OpenAI.
          // Your Squarespace password protection is your access control.
          tokenPayload: JSON.stringify({ purpose: "trend-report" })
        };
      },
      onUploadCompleted: async ({ blob /*, tokenPayload */ }) => {
        // Optional: you could log or store blob.url somewhere
        console.log("Upload complete:", blob.url);
      }
    });

    return json(res, 200, result);
  } catch (e) {
    // If this throws, the browser will show "CORS", so we must return JSON with CORS headers already set
    return json(res, 400, { error: "BLOB TOKEN FAILED", details: String(e?.message || e) });
  }
}
