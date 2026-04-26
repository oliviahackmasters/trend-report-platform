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
    return res.status(405).json({ error: 'Method not allowed' });
  }

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requireDemoToken(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const filename = safeFilename(body.pathname || body.filename || "report.pdf");
    const contentType = body.contentType || "application/pdf";

    if (contentType !== "application/pdf") {
      return res.status(400).json({ error: "Only PDFs are allowed." });
    }

    const key = `uploads/${crypto.randomUUID()}-${filename}`;

    // For now, return the signed URL - CORS needs to be configured in Cloudflare dashboard
    const uploadUrl = await createUploadUrl({ key, contentType });

    return res.status(200).json({
      uploadUrl,
      publicUrl: publicUrlForKey(key),
      key
    });
  } catch (e) {
    console.error("Upload URL generation failed:", e);
    return res.status(500).json({
      error: "Failed to generate upload URL",
      details: String(e?.message || e)
    });
  }
}