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

  if (req.method !== "POST") {
    return json(res, 405, { error: "Use POST" });
  }

  const body = typeof req.body === "string"
    ? JSON.parse(req.body)
    : req.body;

  const filename = body?.filename;

  if (!filename) {
    return json(res, 400, { error: "Missing filename" });
  }

  // Generate signed upload URL
  const blob = await put(filename, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN
  });

  return json(res, 200, {
    url: blob.url
  });
}
