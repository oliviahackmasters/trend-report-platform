/**
 * API endpoint to normalize all existing company names in stored metadata
 * Run via: curl -X POST https://trend-report-platform.vercel.app/api/migrate-company-names
 * Or access via browser: https://trend-report-platform.vercel.app/api/migrate-company-names
 */
import { list, put } from "@vercel/blob";
import { setCors, handleOptions, requireDemoToken } from "../lib/cors.js";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

/**
 * Normalize company names to canonical forms
 */
function normalizeCompanyName(company) {
  if (!company) return "";
  
  const input = String(company || "").trim();
  if (!input) return "";

  const companyMap = {
    // Deloitte
    deloitte: "Deloitte",
    deloite: "Deloitte",
    dltt: "Deloitte",
    di: "Deloitte",

    // McKinsey
    mckinsey: "McKinsey & Company",
    mckinsey_company: "McKinsey & Company",
    mckinsey_co: "McKinsey & Company",
    mcg: "McKinsey & Company",

    // Boston Consulting Group
    bcg: "Boston Consulting Group",
    boston_consulting: "Boston Consulting Group",

    // Bain
    bain: "Bain & Company",
    bain_company: "Bain & Company",

    // PwC
    pwc: "PwC",
    pricewaterhousecoopers: "PwC",
    pricewaterhouse: "PwC",
    pwcc: "PwC",

    // KPMG
    kpmg: "KPMG",
    kpmgllp: "KPMG",

    // EY
    ey: "EY",
    ernst_young: "EY",
    ernst_and_young: "EY",

    // OC&C
    occ: "OC&C Strategy Consultants",
    occ_strategy: "OC&C Strategy Consultants",

    // L.E.K.
    lek: "L.E.K. Consulting",
    lek_consulting: "L.E.K. Consulting",

    // Accenture
    accenture: "Accenture",

    // Oliver Wyman
    oliver_wyman: "Oliver Wyman",
    oliverwyman: "Oliver Wyman",

    // Capgemini
    capgemini: "Capgemini",

    // Gartner
    gartner: "Gartner",

    // Forrester
    forrester: "Forrester",

    // IDC
    idc: "IDC",

    // Economist Intelligence Unit
    eiu: "The Economist Intelligence Unit",
    economist_intelligence: "The Economist Intelligence Unit",
    economist_unit: "The Economist Intelligence Unit",
  };

  const normalized = input
    .toLowerCase()
    .replace(/[&.,\-\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  if (companyMap[normalized]) {
    return companyMap[normalized];
  }

  for (const [key, canonical] of Object.entries(companyMap)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return canonical;
    }
  }

  return input.split(/[\s\-&]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export const config = { maxDuration: 300 }; // 5 minutes for large migrations

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requireDemoToken(req, res)) return;

  if (req.method !== "POST" && req.method !== "GET") {
    return json(res, 405, { error: "Use GET or POST." });
  }

  try {
    // List all metadata files
    const metas = await list({ prefix: "trend-library/meta/" });
    const metaFiles = metas.blobs || [];

    let updated = 0;
    let unchanged = 0;
    const changes = [];
    const errors = [];

    for (const blob of metaFiles) {
      if (!blob.pathname.endsWith(".json")) continue;

      try {
        const resp = await fetch(blob.url);
        const meta = await resp.json();

        const oldCompany = meta.tags?.company || "";
        const newCompany = normalizeCompanyName(oldCompany);

        if (oldCompany && oldCompany !== newCompany) {
          meta.tags = meta.tags || {};
          meta.tags.company = newCompany;

          await put(blob.pathname, JSON.stringify(meta, null, 2), {
            access: "public",
            contentType: "application/json",
            addRandomSuffix: false
          });

          changes.push({
            file: blob.pathname,
            old: oldCompany,
            new: newCompany,
            sector: meta.sector || "unknown"
          });

          updated++;
        } else if (!oldCompany) {
          unchanged++;
        }
      } catch (fileErr) {
        errors.push({
          file: blob.pathname,
          error: fileErr.message
        });
      }
    }

    // Group changes by sector
    const bySector = {};
    changes.forEach(c => {
      if (!bySector[c.sector]) bySector[c.sector] = [];
      bySector[c.sector].push(c);
    });

    const summary = {};
    for (const [sector, items] of Object.entries(bySector)) {
      const byOld = {};
      items.forEach(item => {
        if (!byOld[item.old]) byOld[item.old] = { count: 0, newName: item.new };
        byOld[item.old].count++;
      });
      summary[sector] = byOld;
    }

    return json(res, 200, {
      success: true,
      status: "Migration complete",
      stats: {
        totalFiles: metaFiles.filter(b => b.pathname.endsWith(".json")).length,
        updated,
        unchanged,
        errors: errors.length
      },
      summary,
      changes: changes.slice(0, 50), // Return first 50 for display
      errors: errors.slice(0, 10),
      note: changes.length > 50 ? `Showing first 50 of ${changes.length} changes` : undefined
    });
  } catch (err) {
    return json(res, 500, { 
      error: "MIGRATION FAILED", 
      details: err.message 
    });
  }
}
