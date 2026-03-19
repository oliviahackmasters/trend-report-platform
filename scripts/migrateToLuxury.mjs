import { list, put, del } from "@vercel/blob";

// This script moves existing metadata JSON files from the legacy root folder
// (trend-library/meta/<hash>.json) into the new luxury sector folder:
// trend-library/meta/luxury/<hash>.json.
//
// Usage (set a valid blob token first):
//   BLOB_READ_WRITE_TOKEN=... node scripts/migrateToLuxury.mjs
// or on Windows (PowerShell):
//   $env:BLOB_READ_WRITE_TOKEN="..."; node scripts/migrateToLuxury.mjs

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("ERROR: BLOB_READ_WRITE_TOKEN environment variable is required.");
  console.error("Create a write token in Vercel and set it before running this script.");
  process.exit(1);
}

function isLegacyMetaKey(key) {
  return /^trend-library\/meta\/[0-9a-f]{64}\.json$/i.test(key);
}

function extractKeyFromBlob(blob) {
  // @vercel/blob list entries often include name/url
  if (blob.name) return blob.name;
  if (blob.key) return blob.key;
  if (blob.url) {
    try {
      const u = new URL(blob.url);
      const path = u.pathname.replace(/^\//, "");
      return path || null;
    } catch {
      return null;
    }
  }
  return null;
}

async function main() {
  console.log("Starting migration: root meta -> luxury sector...");

  const resp = await list({ prefix: "trend-library/meta/" });
  const blobs = Array.isArray(resp.blobs) ? resp.blobs : [];
  console.log(`Found ${blobs.length} meta blobs total.`);

  const candidates = blobs
    .map((b) => ({ blob: b, key: extractKeyFromBlob(b) }))
    .filter((x) => x.key && isLegacyMetaKey(x.key));

  console.log(`Found ${candidates.length} legacy meta blobs to migrate.`);

  let moved = 0;

  for (const { blob, key } of candidates) {
    try {
      const res = await fetch(blob.url);
      if (!res.ok) {
        console.warn(`Skipping ${key}: failed to fetch metadata (${res.status})`);
        continue;
      }
      const meta = await res.json().catch(() => null);
      if (!meta) {
        console.warn(`Skipping ${key}: could not parse JSON`);
        continue;
      }

      // Determine hash to name destination file.
      const hash = String(meta.hash || "").trim();
      if (!/^[0-9a-f]{64}$/i.test(hash)) {
        console.warn(`Skipping ${key}: missing/invalid hash in metadata`);
        continue;
      }

      const newKey = `trend-library/meta/luxury/${hash}.json`;
      const newMeta = { ...meta, sector: "luxury" };

      await put(newKey, JSON.stringify(newMeta, null, 2), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false
      });

      // Delete old root-level item
      await del(blob.url);
      moved += 1;
      console.log(`Migrated: ${key} -> ${newKey}`);
    } catch (err) {
      console.warn(`Error migrating ${key}:`, err?.message || err);
    }
  }

  console.log(`Migration complete. Moved ${moved} item(s).`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
