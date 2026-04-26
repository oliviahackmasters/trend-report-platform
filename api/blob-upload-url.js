import crypto from "crypto";
import { createUploadUrl, publicUrlForKey } from "../lib/r2.js";
import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";

function safeFilename(name) {
  return String(name || "report.pdf")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requireDemoToken(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    // Validate environment variables
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
      console.error("Missing R2 environment variables");
      return res.status(500).json({
        error: "Server configuration error",
        details: "R2 environment variables not configured"
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const filename = safeFilename(body.pathname || body.filename || "report.pdf");
    const contentType = body.contentType || "application/pdf";

    if (contentType !== "application/pdf") {
      return res.status(400).json({ error: "Only PDFs are allowed." });
    }

    const key = `uploads/${crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')}-${filename}`;

    console.log("Generating upload URL for key:", key);
    const uploadUrl = await createUploadUrl({ key, contentType });
    const publicUrl = publicUrlForKey(key);

    return res.status(200).json({
      uploadUrl,
      publicUrl,
      blobUrl: publicUrl,
      key,
      pathname: key
    });
  } catch (e) {
    console.error("Upload URL generation failed:", e);
    return res.status(500).json({
      error: "Failed to generate upload URL",
      details: String(e?.message || e)
    });
  }
}import { handleUpload } from "@vercel/blob/client";
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
          access: "public",
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
