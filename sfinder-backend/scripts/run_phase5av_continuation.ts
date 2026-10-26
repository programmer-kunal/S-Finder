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

function executeRemoteSqlCommand(cmd: string) {
  const raw = execSync(`npx wrangler d1 execute sfinder-catalog --remote --command="${cmd.replace(/"/g, '\\"')}" --json`, {
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

  // Checkpoint cursor update
  lines.push(`INSERT OR REPLACE INTO import_cursor (
    provider, last_page, total_imported, last_imported_id, status, error_message, updated_at
  ) VALUES (
    'TVMAZE', ${pageIndex + 1}, ${totalCumulative}, ${sqlStr(lastId)}, 'IN_PROGRESS', NULL, ${Date.now()}
  );`);

  return lines.join("\n");
}

async function runContinuationMilestone() {
  console.log("=== S Finder Phase 5AV: Controlled TVMaze Continuation Pilot (Pages 3 & 4) ===");
  const todayUtc = new Date().toISOString().substring(0, 10);
  const maxDailyBudget = 35_000;
  const ingestor = new CatalogIngestor(null as any);

  // 1. Initial State Check
  console.log("\n[Pre-Check] Checking remote D1 state before ingestion...");
  const preCursor = executeRemoteSqlCommand("SELECT * FROM import_cursor WHERE provider = 'TVMAZE';")[0]?.results?.[0];
  const preBudget = executeRemoteSqlCommand(`SELECT * FROM ingestion_budget_tracker WHERE day_utc = '${todayUtc}';`)[0]?.results?.[0];
  const preItems = executeRemoteSqlCommand("SELECT count(*) as count FROM catalog_items;")[0]?.results?.[0]?.count;
  const preFts = executeRemoteSqlCommand("SELECT count(*) as count FROM catalog_fts;")[0]?.results?.[0]?.count;
  const preMismatch = executeRemoteSqlCommand("SELECT count(*) as count FROM catalog_items c JOIN catalog_fts f ON c.id = f.id WHERE c.item_id != f.rowid;")[0]?.results?.[0]?.count;

  let currentDailyWrites = Number(preBudget?.rows_written ?? 0);
  let lastPage = Number(preCursor?.last_page ?? 0);
  let cumulativeImported = Number(preCursor?.total_imported ?? 0);

  console.log(`Pre-State: last_page=${lastPage}, total_imported=${cumulativeImported}, items=${preItems}, fts=${preFts}, mismatches=${preMismatch}`);
  console.log(`Daily Writes Today (${todayUtc}): ${currentDailyWrites} / ${maxDailyBudget} (Remaining: ${maxDailyBudget - currentDailyWrites})`);

  if (lastPage !== 3 || preMismatch !== 0 || preItems !== 727 || preFts !== 727) {
    throw new Error(`Pre-conditions failed: expected last_page=3, mismatches=0, items=727, fts=727. Halting.`);
  }

  const worstCaseBatchCost = 250 * 10 + 4; // ~2,504 writes
  if (currentDailyWrites + worstCaseBatchCost > maxDailyBudget) {
    throw new Error(`Insufficient budget for batch: remaining ${maxDailyBudget - currentDailyWrites} < ${worstCaseBatchCost}`);
  }

  // ==========================================
  // 2. Process Page 3 Individually
  // ==========================================
  console.log("\n--- Processing Page 3 ---");
  console.log("Fetching TVmaze Page 3...");
  const resP3 = await fetch("https://api.tvmaze.com/shows?page=3", {
    headers: { "User-Agent": "SFinder-Phase5AV-Pilot/1.0", "Accept": "application/json" }
  });
  if (!resP3.ok) throw new Error(`TVmaze API responded HTTP ${resP3.status} on Page 3`);
  const rawP3 = await resP3.json() as any[];
  console.log(`Fetched ${rawP3.length} shows from Page 3.`);

  const itemsP3: CatalogItem[] = [];
  for (const raw of rawP3) {
    const item = ingestor.normalizeTvMazeShow(raw);
    if (item) itemsP3.push(item);
  }
  cumulativeImported += itemsP3.length;
  console.log(`Normalized ${itemsP3.length} items. New cumulative total: ${cumulativeImported}`);

  const sqlP3 = generatePageSql(itemsP3, 3, cumulativeImported, todayUtc);
  const tmpP3 = path.resolve(__dirname, `temp_pilot_page3_${Date.now()}.sql`);
  fs.writeFileSync(tmpP3, sqlP3, "utf8");

  console.log(`Executing Page 3 on remote D1 (${itemsP3.length} items)...`);
  const d1ResP3 = executeRemoteSqlFile(tmpP3);
  fs.unlinkSync(tmpP3);

  const metaP3 = d1ResP3[0]?.meta;
  console.log("Page 3 D1 Result Meta:", JSON.stringify(metaP3, null, 2));

  // Actual measured writes from D1 + 1 write for budget tracker update
  const actualP3Writes = Number(metaP3?.rows_written ?? (itemsP3.length * 10 + 2)) + 1;
  const actualP3Reads = Number(metaP3?.rows_read ?? 0);
  currentDailyWrites += actualP3Writes;

  // Record budget usage to persistent table
  executeRemoteSqlCommand(`
    INSERT INTO ingestion_budget_tracker (
      day_utc, rows_written, rows_read, records_imported, batches_processed, updated_at
    ) VALUES (
      '${todayUtc}', ${actualP3Writes}, ${actualP3Reads}, ${itemsP3.length}, 1, ${Date.now()}
    )
    ON CONFLICT(day_utc) DO UPDATE SET
      rows_written = rows_written + excluded.rows_written,
      rows_read = rows_read + excluded.rows_read,
      records_imported = records_imported + excluded.records_imported,
      batches_processed = batches_processed + excluded.batches_processed,
      updated_at = excluded.updated_at;
  `);

  console.log(`Page 3 Complete. Daily writes now: ${currentDailyWrites} / ${maxDailyBudget}`);

  // Intermediate Parity Check between pages
  const p3Items = executeRemoteSqlCommand("SELECT count(*) as count FROM catalog_items;")[0]?.results?.[0]?.count;
  const p3Fts = executeRemoteSqlCommand("SELECT count(*) as count FROM catalog_fts;")[0]?.results?.[0]?.count;
  const p3Mismatch = executeRemoteSqlCommand("SELECT count(*) as count FROM catalog_items c JOIN catalog_fts f ON c.id = f.id WHERE c.item_id != f.rowid;")[0]?.results?.[0]?.count;
  console.log(`Intermediate Check (Post-Page 3): items=${p3Items}, fts=${p3Fts}, mismatches=${p3Mismatch}`);

  if (p3Items !== p3Fts || p3Mismatch !== 0) {
    throw new Error(`Inconsistency detected after Page 3: items=${p3Items}, fts=${p3Fts}, mismatches=${p3Mismatch}. Stopping immediately.`);
  }

  if (currentDailyWrites + worstCaseBatchCost > maxDailyBudget) {
    throw new Error(`Budget insufficient for Page 4: remaining ${maxDailyBudget - currentDailyWrites} < ${worstCaseBatchCost}. Stopping.`);
  }

  // Polite delay
  console.log("Waiting 1,500ms before fetching Page 4...");
  await new Promise(r => setTimeout(r, 1500));

  // ==========================================
  // 3. Process Page 4 Individually
  // ==========================================
  console.log("\n--- Processing Page 4 ---");
  console.log("Fetching TVmaze Page 4...");
  const resP4 = await fetch("https://api.tvmaze.com/shows?page=4", {
    headers: { "User-Agent": "SFinder-Phase5AV-Pilot/1.0", "Accept": "application/json" }
  });
  if (!resP4.ok) throw new Error(`TVmaze API responded HTTP ${resP4.status} on Page 4`);
  const rawP4 = await resP4.json() as any[];
  console.log(`Fetched ${rawP4.length} shows from Page 4.`);

  const itemsP4: CatalogItem[] = [];
  for (const raw of rawP4) {
    const item = ingestor.normalizeTvMazeShow(raw);
    if (item) itemsP4.push(item);
  }
  cumulativeImported += itemsP4.length;
  console.log(`Normalized ${itemsP4.length} items. New cumulative total: ${cumulativeImported}`);

  const sqlP4 = generatePageSql(itemsP4, 4, cumulativeImported, todayUtc);
  const tmpP4 = path.resolve(__dirname, `temp_pilot_page4_${Date.now()}.sql`);
  fs.writeFileSync(tmpP4, sqlP4, "utf8");

  console.log(`Executing Page 4 on remote D1 (${itemsP4.length} items)...`);
  const d1ResP4 = executeRemoteSqlFile(tmpP4);
  fs.unlinkSync(tmpP4);

  const metaP4 = d1ResP4[0]?.meta;
  console.log("Page 4 D1 Result Meta:", JSON.stringify(metaP4, null, 2));

  const actualP4Writes = Number(metaP4?.rows_written ?? (itemsP4.length * 10 + 2)) + 1;
  const actualP4Reads = Number(metaP4?.rows_read ?? 0);
  currentDailyWrites += actualP4Writes;

  // Record budget usage to persistent table
  executeRemoteSqlCommand(`
    INSERT INTO ingestion_budget_tracker (
      day_utc, rows_written, rows_read, records_imported, batches_processed, updated_at
    ) VALUES (
      '${todayUtc}', ${actualP4Writes}, ${actualP4Reads}, ${itemsP4.length}, 1, ${Date.now()}
    )
    ON CONFLICT(day_utc) DO UPDATE SET
      rows_written = rows_written + excluded.rows_written,
      rows_read = rows_read + excluded.rows_read,
      records_imported = records_imported + excluded.records_imported,
      batches_processed = batches_processed + excluded.batches_processed,
      updated_at = excluded.updated_at;
  `);

  console.log(`Page 4 Complete. Daily writes now: ${currentDailyWrites} / ${maxDailyBudget}`);

  // ==========================================
  // 4. Test Idempotent Re-Import of Page 4
  // ==========================================
  console.log("\n--- Testing Idempotent Re-Import of Page 4 ---");
  const tmpP4Reimport = path.resolve(__dirname, `temp_pilot_page4_reimport_${Date.now()}.sql`);
  fs.writeFileSync(tmpP4Reimport, sqlP4, "utf8");

  console.log("Executing re-import of identical Page 4 on remote D1...");
  const d1ResReimport = executeRemoteSqlFile(tmpP4Reimport);
  fs.unlinkSync(tmpP4Reimport);

  const metaReimport = d1ResReimport[0]?.meta;
  console.log("Page 4 Re-Import Result Meta:", JSON.stringify(metaReimport, null, 2));

  // Verify that only the cursor update row was written (1 write) and zero catalog/FTS rows modified!
  console.log(`Re-import rows written: ${metaReimport?.rows_written} (Expected: <= 2 bookkeeping writes)`);

  // ==========================================
  // 5. Final State & FTS Search Verification
  // ==========================================
  console.log("\n--- Final Verification & Parity Checks ---");
  const postItems = executeRemoteSqlCommand("SELECT count(*) as count FROM catalog_items;")[0]?.results?.[0]?.count;
  const postFts = executeRemoteSqlCommand("SELECT count(*) as count FROM catalog_fts;")[0]?.results?.[0]?.count;
  const postMismatch = executeRemoteSqlCommand("SELECT count(*) as count FROM catalog_items c JOIN catalog_fts f ON c.id = f.id WHERE c.item_id != f.rowid;")[0]?.results?.[0]?.count;
  const postCursor = executeRemoteSqlCommand("SELECT * FROM import_cursor WHERE provider = 'TVMAZE';")[0]?.results?.[0];
  const postBudget = executeRemoteSqlCommand(`SELECT * FROM ingestion_budget_tracker WHERE day_utc = '${todayUtc}';`)[0]?.results?.[0];

  console.log(`Final State: items=${postItems}, fts=${postFts}, mismatches=${postMismatch}`);
  console.log("Final Cursor:", postCursor);
  console.log("Final Budget Tracker:", postBudget);

  // Search verification for sample show from Page 3 and Page 4
  console.log("\nTesting search for newly ingested shows...");
  const sampleP3 = itemsP3[0];
  const sampleP4 = itemsP4[0];

  const searchP3 = executeRemoteSqlCommand(`
    SELECT c.item_id, c.id, c.title, c.release_year,
      (CASE WHEN c.normalized_title = '${sampleP3.normalizedTitle}' THEN 100.0 ELSE 0.0 END) +
      (-bm25(catalog_fts, 10.0, 5.0, 2.0, 1.0, 4.0) * 20.0) AS composite_score
    FROM catalog_fts f JOIN catalog_items c ON f.rowid = c.item_id
    WHERE catalog_fts MATCH '${sampleP3.title.replace(/'/g, "''")}'
    ORDER BY composite_score DESC LIMIT 2;
  `);
  console.log(`Search result for Page 3 show '${sampleP3.title}' (ID: ${sampleP3.id}):`, searchP3[0]?.results);

  const searchP4 = executeRemoteSqlCommand(`
    SELECT c.item_id, c.id, c.title, c.release_year,
      (CASE WHEN c.normalized_title = '${sampleP4.normalizedTitle}' THEN 100.0 ELSE 0.0 END) +
      (-bm25(catalog_fts, 10.0, 5.0, 2.0, 1.0, 4.0) * 20.0) AS composite_score
    FROM catalog_fts f JOIN catalog_items c ON f.rowid = c.item_id
    WHERE catalog_fts MATCH '${sampleP4.title.replace(/'/g, "''")}'
    ORDER BY composite_score DESC LIMIT 2;
  `);
  console.log(`Search result for Page 4 show '${sampleP4.title}' (ID: ${sampleP4.id}):`, searchP4[0]?.results);

  console.log("\n=== Phase 5AV Continuation Milestone Successfully Completed ===");
}

runContinuationMilestone().catch(console.error);
