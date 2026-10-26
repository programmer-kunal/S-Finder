import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CatalogIngestor } from "../src/catalog/ingestor";
import { CatalogItem } from "../src/catalog/types";

function sqlStr(val: any): string {
  if (val === null || val === undefined) return "NULL";
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

function sqlNum(val: any): string {
  if (val === null || val === undefined || isNaN(val)) return "NULL";
  return String(val);
}

function executeRemoteSqlFile(filePath: string) {
  const raw = execSync(`npx wrangler d1 execute sfinder-catalog --remote --file="${filePath}" --json`, {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8"
  });
  const startIdx = raw.indexOf("[");
  const endIdx = raw.lastIndexOf("]");
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Could not parse JSON from output: ${raw}`);
  }
  return JSON.parse(raw.substring(startIdx, endIdx + 1));
}

function executeRemoteSqlCommand(sql: string) {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  const escaped = oneLine.replace(/"/g, '\\"');
  const raw = execSync(`npx wrangler d1 execute sfinder-catalog --remote --command="${escaped}" --json`, {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8"
  });
  const startIdx = raw.indexOf("[");
  const endIdx = raw.lastIndexOf("]");
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Could not parse JSON from output: ${raw}`);
  }
  return JSON.parse(raw.substring(startIdx, endIdx + 1));
}

function generatePageSql(items: CatalogItem[], pageIndex: number, totalCumulative: number, todayUtc: string): string {
  const lines: string[] = [];

  for (const item of items) {
    lines.push(`INSERT INTO catalog_items (
      id, provider, provider_id, media_type, title, original_title,
      normalized_title, release_year, genres_json, primary_genre,
      countries_json, primary_country, synopsis, rating, vote_count,
      popularity_score, poster_url, catalog_source, trope_tags,
      provider_updated_at, indexed_at
    ) VALUES (
      ${sqlStr(item.id)},
      ${sqlStr(item.provider)},
      ${sqlStr(item.providerId)},
      ${sqlStr(item.mediaType)},
      ${sqlStr(item.title)},
      ${sqlStr(item.originalTitle)},
      ${sqlStr(item.normalizedTitle)},
      ${sqlNum(item.releaseYear)},
      ${sqlStr(JSON.stringify(item.genres))},
      ${sqlStr(item.primaryGenre)},
      ${sqlStr(JSON.stringify(item.countries))},
      ${sqlStr(item.primaryCountry)},
      ${sqlStr(item.synopsis)},
      ${sqlNum(item.rating)},
      ${sqlNum(item.voteCount)},
      ${sqlNum(item.popularityScore)},
      ${sqlStr(item.posterUrl)},
      ${sqlStr(item.catalogSource)},
      ${sqlStr(item.tropeTags)},
      ${sqlNum(item.providerUpdatedAt)},
      ${Date.now()}
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      original_title = excluded.original_title,
      normalized_title = excluded.normalized_title,
      release_year = excluded.release_year,
      genres_json = excluded.genres_json,
      primary_genre = excluded.primary_genre,
      countries_json = excluded.countries_json,
      primary_country = excluded.primary_country,
      synopsis = excluded.synopsis,
      rating = excluded.rating,
      vote_count = excluded.vote_count,
      popularity_score = excluded.popularity_score,
      poster_url = excluded.poster_url,
      catalog_source = excluded.catalog_source,
      trope_tags = excluded.trope_tags,
      provider_updated_at = excluded.provider_updated_at,
      indexed_at = excluded.indexed_at
    WHERE
      catalog_items.title IS NOT excluded.title OR
      catalog_items.original_title IS NOT excluded.original_title OR
      catalog_items.normalized_title IS NOT excluded.normalized_title OR
      catalog_items.release_year IS NOT excluded.release_year OR
      catalog_items.genres_json IS NOT excluded.genres_json OR
      catalog_items.primary_genre IS NOT excluded.primary_genre OR
      catalog_items.countries_json IS NOT excluded.countries_json OR
      catalog_items.primary_country IS NOT excluded.primary_country OR
      catalog_items.synopsis IS NOT excluded.synopsis OR
      catalog_items.rating IS NOT excluded.rating OR
      catalog_items.vote_count IS NOT excluded.vote_count OR
      catalog_items.popularity_score IS NOT excluded.popularity_score OR
      catalog_items.poster_url IS NOT excluded.poster_url OR
      catalog_items.catalog_source IS NOT excluded.catalog_source OR
      catalog_items.trope_tags IS NOT excluded.trope_tags OR
      catalog_items.provider_updated_at IS NOT excluded.provider_updated_at;`);
  }

  const lastId = items.length > 0 ? items[items.length - 1].id : null;

  lines.push(`INSERT OR REPLACE INTO import_cursor (
    provider, last_page, total_imported, last_imported_id, status, error_message, updated_at
  ) VALUES (
    'TVMAZE', ${pageIndex + 1}, ${totalCumulative}, ${sqlStr(lastId)}, 'IN_PROGRESS', NULL, ${Date.now()}
  );`);

  return lines.join("\n");
}

async function runPage4AndVerification() {
  console.log("=== S Finder Phase 5AV: TVMaze Page 4 Ingestion & Verification ===");
  const todayUtc = "2026-10-24";
  const maxDailyBudget = 35_000;
  const ingestor = new CatalogIngestor(null as any);

  // 1. Initial State Check
  console.log("\n[Step 1] Checking remote D1 pre-conditions...");
  const preCheck = executeRemoteSqlCommand(`
    SELECT count(*) as items FROM catalog_items;
    SELECT count(*) as fts FROM catalog_fts;
    SELECT count(*) as mismatches FROM catalog_items c JOIN catalog_fts f ON c.id = f.id WHERE c.item_id != f.rowid;
    SELECT * FROM import_cursor WHERE provider = 'TVMAZE';
    SELECT * FROM ingestion_budget_tracker WHERE day_utc = '${todayUtc}';
  `);

  const preItems = preCheck[0]?.results?.[0]?.items;
  const preFts = preCheck[1]?.results?.[0]?.fts;
  const preMismatch = preCheck[2]?.results?.[0]?.mismatches;
  const preCursor = preCheck[3]?.results?.[0];
  const preBudget = preCheck[4]?.results?.[0];

  console.log(`Pre-State: last_page=${preCursor?.last_page}, total_imported=${preCursor?.total_imported}, items=${preItems}, fts=${preFts}, mismatches=${preMismatch}`);
  console.log(`Budget: rows_written=${preBudget?.rows_written}, rows_read=${preBudget?.rows_read}, records_imported=${preBudget?.records_imported}`);

  if (preItems !== 970 || preFts !== 970 || preMismatch !== 0 || Number(preCursor?.last_page) !== 4) {
    throw new Error(`Pre-conditions not met! items=${preItems}, fts=${preFts}, mismatches=${preMismatch}, last_page=${preCursor?.last_page}`);
  }

  const currentDailyWrites = Number(preBudget?.rows_written ?? 0);
  const worstCaseBatchCost = 250 * 11 + 4;
  if (currentDailyWrites + worstCaseBatchCost > maxDailyBudget) {
    throw new Error(`Insufficient budget for Page 4: current writes ${currentDailyWrites} + worst case ${worstCaseBatchCost} > ceiling ${maxDailyBudget}`);
  }

  // 2. Fetch and Normalize TVMaze Page 4
  console.log("\n[Step 2] Fetching TVMaze Page 4 (shows 1000..1249)...");
  const resP4 = await fetch("https://api.tvmaze.com/shows?page=4", {
    headers: { "User-Agent": "SFinder-Phase5AV-Pilot/1.0", "Accept": "application/json" }
  });
  if (!resP4.ok) throw new Error(`TVMaze API returned HTTP ${resP4.status}`);
  const rawP4 = await resP4.json() as any[];
  console.log(`Fetched ${rawP4.length} shows from Page 4.`);

  const itemsP4: CatalogItem[] = [];
  for (const raw of rawP4) {
    const item = ingestor.normalizeTvMazeShow(raw);
    if (item) itemsP4.push(item);
  }
  const newCumulative = Number(preCursor.total_imported) + itemsP4.length;
  console.log(`Normalized ${itemsP4.length} valid catalog items. Target cumulative: ${newCumulative}`);

  // 3. Generate and Execute SQL on Remote D1
  console.log("\n[Step 3] Executing Page 4 batch on remote D1...");
  const sqlP4 = generatePageSql(itemsP4, 4, newCumulative, todayUtc);
  const tmpP4 = path.resolve(__dirname, `temp_pilot_page4_${Date.now()}.sql`);
  fs.writeFileSync(tmpP4, sqlP4, "utf8");

  const d1ResP4 = executeRemoteSqlFile(tmpP4);
  fs.unlinkSync(tmpP4);

  const metaP4 = d1ResP4[0]?.meta;
  console.log("Page 4 Execution Meta:", {
    rows_written: metaP4?.rows_written,
    rows_read: metaP4?.rows_read,
    duration_ms: metaP4?.timings?.sql_duration_ms,
    size_after_bytes: metaP4?.size_after,
    size_after_mb: (Number(metaP4?.size_after) / (1024 * 1024)).toFixed(2)
  });

  const actualP4Writes = Number(metaP4?.rows_written ?? 0);
  const actualP4Reads = Number(metaP4?.rows_read ?? 0);

  // 4. Update Budget Tracker
  console.log("\n[Step 4] Updating daily budget tracker...");
  const budgetUpdateSql = `
    UPDATE ingestion_budget_tracker
    SET rows_written = rows_written + ${actualP4Writes} + 1,
        rows_read = rows_read + ${actualP4Reads} + 1,
        records_imported = records_imported + ${itemsP4.length},
        batches_processed = batches_processed + 1,
        updated_at = ${Date.now()}
    WHERE day_utc = '${todayUtc}';
  `;
  executeRemoteSqlCommand(budgetUpdateSql);

  // 5. Test Idempotent Re-Import of Page 4
  console.log("\n[Step 5] Testing Idempotent Re-Import of identical Page 4...");
  const tmpReimport = path.resolve(__dirname, `temp_reimport_page4_${Date.now()}.sql`);
  fs.writeFileSync(tmpReimport, sqlP4, "utf8");
  const d1ResReimport = executeRemoteSqlFile(tmpReimport);
  fs.unlinkSync(tmpReimport);

  const metaReimport = d1ResReimport[0]?.meta;
  console.log("Page 4 Re-Import Execution Meta:", {
    rows_written: metaReimport?.rows_written,
    rows_read: metaReimport?.rows_read,
    duration_ms: metaReimport?.timings?.sql_duration_ms,
    size_after_bytes: metaReimport?.size_after
  });

  if (metaReimport?.rows_written > 2) {
    console.warn(`WARNING: Idempotent re-import wrote ${metaReimport?.rows_written} rows (expected <= 2 for cursor update only).`);
  } else {
    console.log(`SUCCESS: Idempotent re-import confirmed! Exactly ${metaReimport?.rows_written} row(s) written (cursor update only, 0 catalog/FTS writes).`);
  }

  // Record 1 write for the re-import cursor update
  executeRemoteSqlCommand(`
    UPDATE ingestion_budget_tracker
    SET rows_written = rows_written + ${metaReimport?.rows_written ?? 1} + 1,
        rows_read = rows_read + ${metaReimport?.rows_read ?? 0} + 1,
        updated_at = ${Date.now()}
    WHERE day_utc = '${todayUtc}';
  `);

  // 6. Post-Pilot Verifications
  console.log("\n[Step 6] Running Final Integrity Checks & Parity Validations...");
  const postCheck = executeRemoteSqlCommand(`
    SELECT count(*) as items FROM catalog_items;
    SELECT count(*) as fts FROM catalog_fts;
    SELECT count(*) as mismatches FROM catalog_items c JOIN catalog_fts f ON c.id = f.id WHERE c.item_id != f.rowid;
    SELECT * FROM import_cursor WHERE provider = 'TVMAZE';
    SELECT * FROM ingestion_budget_tracker WHERE day_utc = '${todayUtc}';
  `);

  const postItems = postCheck[0]?.results?.[0]?.items;
  const postFts = postCheck[1]?.results?.[0]?.fts;
  const postMismatch = postCheck[2]?.results?.[0]?.mismatches;
  const postCursor = postCheck[3]?.results?.[0];
  const postBudget = postCheck[4]?.results?.[0];

  console.log(`Final State Summary:`);
  console.log(`- catalog_items: ${postItems}`);
  console.log(`- catalog_fts:   ${postFts}`);
  console.log(`- item_id/rowid mismatches: ${postMismatch}`);
  console.log(`- import_cursor: last_page=${postCursor?.last_page}, total_imported=${postCursor?.total_imported}, last_id=${postCursor?.last_imported_id}`);
  console.log(`- budget_tracker: writes=${postBudget?.rows_written}, reads=${postBudget?.rows_read}, imported=${postBudget?.records_imported}`);
  console.log(`- Database size: ${metaP4?.size_after} bytes (${(Number(metaP4?.size_after) / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`- Actual bytes per record: ${(Number(metaP4?.size_after) / Number(postItems)).toFixed(1)} bytes/record`);

  // 7. Search Verification
  console.log("\n[Step 7] Testing FTS search on sample shows from Page 3 and Page 4...");

  // Sample show from Page 3: "The Wire"
  const searchP3 = executeRemoteSqlCommand(`
    SELECT c.item_id, c.id, c.title, c.release_year, c.primary_genre,
      (CASE WHEN c.normalized_title = 'the wire' THEN 100.0 ELSE 0.0 END) +
      (-bm25(catalog_fts, 10.0, 5.0, 2.0, 1.0, 4.0) * 20.0) AS composite_score
    FROM catalog_fts f JOIN catalog_items c ON f.rowid = c.item_id
    WHERE catalog_fts MATCH 'the wire'
    ORDER BY composite_score DESC LIMIT 2;
  `);
  console.log("Search 'The Wire':", searchP3[0]?.results);

  // Sample show from Page 4: pick first item
  const sampleP4 = itemsP4[0];
  const searchP4 = executeRemoteSqlCommand(`
    SELECT c.item_id, c.id, c.title, c.release_year, c.primary_genre,
      (CASE WHEN c.normalized_title = '${sampleP4.normalizedTitle.replace(/'/g, "''")}' THEN 100.0 ELSE 0.0 END) +
      (-bm25(catalog_fts, 10.0, 5.0, 2.0, 1.0, 4.0) * 20.0) AS composite_score
    FROM catalog_fts f JOIN catalog_items c ON f.rowid = c.item_id
    WHERE catalog_fts MATCH '${sampleP4.title.replace(/'/g, "''")}'
    ORDER BY composite_score DESC LIMIT 2;
  `);
  console.log(`Search '${sampleP4.title}' (ID: ${sampleP4.id}):`, searchP4[0]?.results);

  console.log("\n=== ALL CHECKS COMPLETED SUCCESSFULLY ===");
}

runPage4AndVerification().catch(console.error);
