import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";
import { putObject } from "../lib/r2.js";
import busboy from "busboy";

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

  try {
    const bb = busboy({ headers: req.headers });
    let fileBuffer = null;
    let filename = null;
    let fieldName = null;

    bb.on('file', (name, file, info) => {
      fieldName = name;
      filename = safeFilename(info.filename);
      const chunks = [];

      file.on('data', (chunk) => {
        chunks.push(chunk);
      });

      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on('finish', async () => {
      try {
        if (!fileBuffer) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!filename || !filename.endsWith('.pdf')) {
          return res.status(400).json({ error: 'Only PDF files are allowed' });
        }

        const key = `uploads/${crypto.randomUUID()}-${filename}`;

        // Upload directly to R2 (server-side)
        await putObject(key, fileBuffer, 'application/pdf');

        return res.status(200).json({
          success: true,
          key,
          url: `https://trendboiler.9efb638d4bce36925d6fa1dba2176c8c.r2.cloudflarestorage.com/${key}`
        });
      } catch (uploadError) {
        console.error('Upload error:', uploadError);
        return res.status(500).json({
          error: 'Upload failed',
          details: String(uploadError?.message || uploadError)
        });
      }
    });

    req.pipe(bb);
  } catch (e) {
    console.error("Upload handler failed:", e);
    return res.status(500).json({
      error: "Upload handler failed",
      details: String(e?.message || e)
    });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};