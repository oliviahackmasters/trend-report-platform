import { put } from "@vercel/blob";
import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";
import crypto from "crypto";
import { Readable } from "stream";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requireDemoToken(req, res)) return;

  if (req.method !== "POST") return json(res, 405, { error: "Use POST" });

  try {
    // Parse multipart form data
    const formData = await parseFormData(req);
    const file = formData.files?.file?.[0];

    if (!file) return json(res, 400, { error: "No file uploaded" });

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return json(res, 400, { error: "Only PDFs are allowed" });
    }

    // Generate unique key
    const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const key = `uploads/${crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')}-${filename}`;

    // Upload to Vercel Blob
    const blob = await put(key, file.stream(), {
      access: "public",
      contentType: "application/pdf"
    });

    return json(res, 200, {
      url: blob.url,
      blobUrl: blob.url,
      key: blob.pathname
    });
  } catch (e) {
    console.error("Upload failed:", e);
    return json(res, 500, { error: "Upload failed", details: String(e?.message || e) });
  }
}

// Simple multipart parser (since Vercel doesn't have built-in)
async function parseFormData(req) {
  const boundary = req.headers['content-type']?.split('boundary=')[1];
  if (!boundary) throw new Error("No boundary in content-type");

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString();

  // Very basic parser - in production, use a library like formidable or multiparty
  const parts = body.split(`--${boundary}`);
  const files = {};
  const fields = {};

  for (const part of parts) {
    if (part.includes('Content-Disposition')) {
      const lines = part.split('\r\n');
      const disposition = lines[1];
      const nameMatch = disposition.match(/name="([^"]+)"/);
      if (nameMatch) {
        const name = nameMatch[1];
        const filenameMatch = disposition.match(/filename="([^"]+)"/);
        if (filenameMatch) {
          // File
          const filename = filenameMatch[1];
          const contentType = lines[2]?.split(': ')[1] || 'application/octet-stream';
          const dataStart = part.indexOf('\r\n\r\n') + 4;
          const data = part.slice(dataStart, -2); // Remove trailing \r\n
          files[name] = files[name] || [];
          files[name].push({
            name: filename,
            type: contentType,
            data: Buffer.from(data),
            stream: () => Readable.from(data)
          });
        } else {
          // Field
          const value = lines.slice(3).join('\r\n').trim();
          fields[name] = value;
        }
      }
    }
  }

  return { files, fields };
}