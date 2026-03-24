/**
 * Migration script to normalize all existing company names in stored metadata
 * Run with: node scripts/normalizeCompanyNames.mjs
 */
import { list, put } from "@vercel/blob";

/**
 * Normalize company names to canonical forms
 * Handles variations like "DELOITTE", "Deloite", "DI" → "Deloitte"
 */
function normalizeCompanyName(company) {
  if (!company) return "";
  
  const input = String(company || "").trim();
  if (!input) return "";

  // Mapping of known variations to canonical names
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

  // Normalize input: lowercase, replace spaces/hyphens with underscores
  const normalized = input
    .toLowerCase()
    .replace(/[&.,\-\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  // Direct lookup
  if (companyMap[normalized]) {
    return companyMap[normalized];
  }

  // Fuzzy matching: check if key is substring of normalized
  for (const [key, canonical] of Object.entries(companyMap)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return canonical;
    }
  }

  // If no match, return original in title case
  return input.split(/[\s\-&]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

async function migrateCompanyNames() {
  console.log("🔄 Starting migration: normalizing company names in all metadata...\n");

  try {
    // List all metadata files
    const metas = await list({ prefix: "trend-library/meta/" });
    const metaFiles = metas.blobs || [];

    console.log(`📦 Found ${metaFiles.length} metadata files to process\n`);

    let updated = 0;
    let unchanged = 0;
    const changes = [];

    for (const blob of metaFiles) {
      // Skip legacy-structured files and focus on individual metadata
      if (!blob.pathname.endsWith(".json")) continue;

      try {
        const resp = await fetch(blob.url);
        const meta = await resp.json();

        const oldCompany = meta.tags?.company || "";
        const newCompany = normalizeCompanyName(oldCompany);

        if (oldCompany && oldCompany !== newCompany) {
          // Update the metadata
          meta.tags = meta.tags || {};
          meta.tags.company = newCompany;

          // Save back to blob storage
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
          console.log(`✅ Updated: ${oldCompany} → ${newCompany} (${blob.pathname})`);
        } else if (!oldCompany) {
          unchanged++;
        }
      } catch (fileErr) {
        console.error(`❌ Error processing ${blob.pathname}:`, fileErr.message);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log(`✅ Migration complete!`);
    console.log(`   Updated: ${updated} files`);
    console.log(`   Unchanged: ${unchanged} files`);
    console.log("=".repeat(60));

    if (changes.length > 0) {
      console.log("\n📋 Summary of changes:\n");
      // Group by sector
      const bySector = {};
      changes.forEach(c => {
        if (!bySector[c.sector]) bySector[c.sector] = [];
        bySector[c.sector].push(c);
      });

      for (const [sector, items] of Object.entries(bySector)) {
        console.log(`\n${sector.toUpperCase()}:`);
        const byOld = {};
        items.forEach(item => {
          if (!byOld[item.old]) byOld[item.old] = 0;
          byOld[item.old]++;
        });
        for (const [old, count] of Object.entries(byOld)) {
          const newName = items.find(i => i.old === old)?.new;
          console.log(`  • ${old} → ${newName} (${count} file${count > 1 ? 's' : ''})`);
        }
      }
    }
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  }
}

// Run the migration
migrateCompanyNames();
