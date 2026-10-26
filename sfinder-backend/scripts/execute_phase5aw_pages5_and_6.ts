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

async function runPhase5AWPages5And6() {
  console.log("=== S Finder Phase 5AW: Controlled Ingestion of Pages 5 & 6 ===");
  const todayUtc = "2026-10-24";
  const maxDailyBudget = 35_000;
  const ingestor = new CatalogIngestor(null as any);

  // 1. Initial State & Budget Check
  console.log("\n[Step 1] Verifying Pre-Conditions and Budget Guard...");
  const preCheck = executeRemoteSqlCommand(`
    SELECT count(*) as items FROM catalog_items;
    SELECT count(*) as fts FROM catalog_fts;
    SELECT count(*) as mismatches FROM catalog_items c JOIN catalog_fts f ON c.id = f.id WHERE c.item_id != f.rowid;
    SELECT * FROM import_cursor WHERE provider = 'TVMAZE';
    SELECT * FROM ingestion_budget_tracker WHERE day_utc = '${todayUtc}';
  `);

  const preItems = Number(preCheck[0]?.results?.[0]?.items);
  const preFts = Number(preCheck[1]?.results?.[0]?.fts);
  const preMismatch = Number(preCheck[2]?.results?.[0]?.mismatches);
  const preCursor = preCheck[3]?.results?.[0];
  const preBudget = preCheck[4]?.results?.[0];

  const currentDailyWrites = Number(preBudget?.rows_written ?? 0);
  const remainingBudget = maxDailyBudget - currentDailyWrites;

  console.log(`Pre-State:`);
  console.log(`- catalog_items: ${preItems}, catalog_fts: ${preFts}, mismatches: ${preMismatch}`);
  console.log(`- cursor: last_page=${preCursor?.last_page}, total_imported=${preCursor?.total_imported}, last_id=${preCursor?.last_imported_id}`);
  console.log(`- budget: writes=${currentDailyWrites} / ${maxDailyBudget} (Remaining: ${remainingBudget})`);

  if (preItems !== 1208 || preFts !== 1208 || preMismatch !== 0 || Number(preCursor?.last_page) !== 5) {
    throw new Error(`Pre-conditions not met! items=${preItems}, fts=${preFts}, mismatches=${preMismatch}, last_page=${preCursor?.last_page}`);
  }

  const worstCasePageCost = 250 * 11 + 4; // ~2,754 writes
  if (remainingBudget < worstCasePageCost * 2) {
    throw new Error(`Insufficient budget for 2 pages: remaining ${remainingBudget} < ${worstCasePageCost * 2}`);
  }

  // 2. Fetch, Normalize & Execute Page 5
  console.log("\n[Step 2] Processing Page 5 (Shows 1250..1499)...");
  const resP5 = await fetch("https://api.tvmaze.com/shows?page=5", {
    headers: { "User-Agent": "SFinder-Phase5AW-Ingestion/1.0", "Accept": "application/json" }
  });
  if (!resP5.ok) throw new Error(`TVMaze API returned HTTP ${resP5.status} on Page 5`);
  const rawP5 = await resP5.json() as any[];
  console.log(`Fetched ${rawP5.length} raw shows from Page 5.`);

  const itemsP5: CatalogItem[] = [];
  for (const raw of rawP5) {
    const item = ingestor.normalizeTvMazeShow(raw);
    if (item) itemsP5.push(item);
  }
  let cumulativeImported = preItems + itemsP5.length;
  console.log(`Normalized ${itemsP5.length} valid catalog items. Target cumulative: ${cumulativeImported}`);

  const sqlP5 = generatePageSql(itemsP5, 5, cumulativeImported, todayUtc);
  const tmpP5 = path.resolve(__dirname, `temp_pilot_page5_${Date.now()}.sql`);
  fs.writeFileSync(tmpP5, sqlP5, "utf8");

  console.log(`Executing Page 5 batch on remote D1 (${itemsP5.length} items)...`);
  const d1ResP5 = executeRemoteSqlFile(tmpP5);
  fs.unlinkSync(tmpP5);

  const metaP5 = d1ResP5[0]?.meta;
  console.log("Page 5 Execution Meta:", {
    rows_written: metaP5?.rows_written,
    rows_read: metaP5?.rows_read,
    duration_ms: metaP5?.timings?.sql_duration_ms,
    size_after_bytes: metaP5?.size_after,
    size_after_mb: (Number(metaP5?.size_after) / (1024 * 1024)).toFixed(2)
  });

  const p5Writes = Number(metaP5?.rows_written ?? 0);
  const p5Reads = Number(metaP5?.rows_read ?? 0);

  // Update budget tracker for Page 5 (+ 1 for tracker update write)
  executeRemoteSqlCommand(`
    UPDATE ingestion_budget_tracker
    SET rows_written = rows_written + ${p5Writes} + 1,
        rows_read = rows_read + ${p5Reads} + 1,
        records_imported = records_imported + ${itemsP5.length},
        batches_processed = batches_processed + 1,
        updated_at = ${Date.now()}
    WHERE day_utc = '${todayUtc}';
  `);

  // Intermediate Parity Check between Page 5 and Page 6
  console.log("\n[Intermediate Check] Validating parity after Page 5...");
  const midCheck = executeRemoteSqlCommand(`
    SELECT count(*) as items FROM catalog_items;
    SELECT count(*) as fts FROM catalog_fts;
    SELECT count(*) as mismatches FROM catalog_items c JOIN catalog_fts f ON c.id = f.id WHERE c.item_id != f.rowid;
    SELECT * FROM ingestion_budget_tracker WHERE day_utc = '${todayUtc}';
  `);
  const midItems = Number(midCheck[0]?.results?.[0]?.items);
  const midFts = Number(midCheck[1]?.results?.[0]?.fts);
  const midMismatch = Number(midCheck[2]?.results?.[0]?.mismatches);
  const midBudget = midCheck[3]?.results?.[0];

  console.log(`Intermediate State: items=${midItems}, fts=${midFts}, mismatches=${midMismatch}`);
  console.log(`Intermediate Budget: writes=${midBudget?.rows_written} / ${maxDailyBudget} (Remaining: ${maxDailyBudget - Number(midBudget?.rows_written)})`);

  if (midItems !== midFts || midMismatch !== 0 || midItems !== cumulativeImported) {
    throw new Error(`Inconsistency detected after Page 5! items=${midItems}, fts=${midFts}, expected=${cumulativeImported}`);
  }

  const remainingForP6 = maxDailyBudget - Number(midBudget?.rows_written);
  if (remainingForP6 < worstCasePageCost) {
    throw new Error(`Insufficient budget for Page 6: remaining ${remainingForP6} < ${worstCasePageCost}. Halting.`);
  }

  // Polite delay
  console.log("Waiting 1,500ms before fetching Page 6...");
  await new Promise(r => setTimeout(r, 1500));

  // 3. Fetch, Normalize & Execute Page 6
  console.log("\n[Step 3] Processing Page 6 (Shows 1500..1749)...");
  const resP6 = await fetch("https://api.tvmaze.com/shows?page=6", {
    headers: { "User-Agent": "SFinder-Phase5AW-Ingestion/1.0", "Accept": "application/json" }
  });
  if (!resP6.ok) throw new Error(`TVMaze API returned HTTP ${resP6.status} on Page 6`);
  const rawP6 = await resP6.json() as any[];
  console.log(`Fetched ${rawP6.length} raw shows from Page 6.`);

  const itemsP6: CatalogItem[] = [];
  for (const raw of rawP6) {
    const item = ingestor.normalizeTvMazeShow(raw);
    if (item) itemsP6.push(item);
  }
  cumulativeImported += itemsP6.length;
  console.log(`Normalized ${itemsP6.length} valid catalog items. Target cumulative: ${cumulativeImported}`);

  const sqlP6 = generatePageSql(itemsP6, 6, cumulativeImported, todayUtc);
  const tmpP6 = path.resolve(__dirname, `temp_pilot_page6_${Date.now()}.sql`);
  fs.writeFileSync(tmpP6, sqlP6, "utf8");

  console.log(`Executing Page 6 batch on remote D1 (${itemsP6.length} items)...`);
  const d1ResP6 = executeRemoteSqlFile(tmpP6);
  fs.unlinkSync(tmpP6);

  const metaP6 = d1ResP6[0]?.meta;
  console.log("Page 6 Execution Meta:", {
    rows_written: metaP6?.rows_written,
    rows_read: metaP6?.rows_read,
    duration_ms: metaP6?.timings?.sql_duration_ms,
    size_after_bytes: metaP6?.size_after,
    size_after_mb: (Number(metaP6?.size_after) / (1024 * 1024)).toFixed(2)
  });

  const p6Writes = Number(metaP6?.rows_written ?? 0);
  const p6Reads = Number(metaP6?.rows_read ?? 0);

  // Update budget tracker for Page 6 (+ 1 for tracker write)
  executeRemoteSqlCommand(`
    UPDATE ingestion_budget_tracker
    SET rows_written = rows_written + ${p6Writes} + 1,
        rows_read = rows_read + ${p6Reads} + 1,
        records_imported = records_imported + ${itemsP6.length},
        batches_processed = batches_processed + 1,
        updated_at = ${Date.now()}
    WHERE day_utc = '${todayUtc}';
  `);

  // 4. Test Idempotent Re-Import of Page 6
  console.log("\n[Step 4] Testing Idempotent Re-Import of identical Page 6...");
  const tmpReimportP6 = path.resolve(__dirname, `temp_reimport_page6_${Date.now()}.sql`);
  fs.writeFileSync(tmpReimportP6, sqlP6, "utf8");
  const d1ResReimportP6 = executeRemoteSqlFile(tmpReimportP6);
  fs.unlinkSync(tmpReimportP6);

  const metaReimportP6 = d1ResReimportP6[0]?.meta;
  console.log("Page 6 Re-Import Execution Meta:", {
    rows_written: metaReimportP6?.rows_written,
    rows_read: metaReimportP6?.rows_read,
    duration_ms: metaReimportP6?.timings?.sql_duration_ms,
    size_after_bytes: metaReimportP6?.size_after
  });

  const reimportWrites = Number(metaReimportP6?.rows_written ?? 1);
  const reimportReads = Number(metaReimportP6?.rows_read ?? 0);

  console.log(`Re-import rows written: ${reimportWrites} (Expected: ~${itemsP6.length + 2} sequence check & cursor writes, 0 catalog/FTS modifications)`);

  // Update budget tracker for re-import
  executeRemoteSqlCommand(`
    UPDATE ingestion_budget_tracker
    SET rows_written = rows_written + ${reimportWrites} + 1,
        rows_read = rows_read + ${reimportReads} + 1,
        updated_at = ${Date.now()}
    WHERE day_utc = '${todayUtc}';
  `);

  // 5. Final State & Verification
  console.log("\n[Step 5] Running Final Integrity Checks & Parity Validations...");
  const postCheck = executeRemoteSqlCommand(`
    SELECT count(*) as items FROM catalog_items;
    SELECT count(*) as fts FROM catalog_fts;
    SELECT count(*) as mismatches FROM catalog_items c JOIN catalog_fts f ON c.id = f.id WHERE c.item_id != f.rowid;
    SELECT * FROM import_cursor WHERE provider = 'TVMAZE';
    SELECT * FROM ingestion_budget_tracker WHERE day_utc = '${todayUtc}';
  `);

  const postItems = Number(postCheck[0]?.results?.[0]?.items);
  const postFts = Number(postCheck[1]?.results?.[0]?.fts);
  const postMismatch = Number(postCheck[2]?.results?.[0]?.mismatches);
  const postCursor = postCheck[3]?.results?.[0];
  const postBudget = postCheck[4]?.results?.[0];

  const finalSize = Number(metaP6?.size_after ?? metaReimportP6?.size_after);
  const bytesPerRecord = (finalSize / postItems).toFixed(1);

  console.log(`\nFinal State Summary:`);
  console.log(`- catalog_items: ${postItems}`);
  console.log(`- catalog_fts:   ${postFts}`);
  console.log(`- item_id/rowid mismatches: ${postMismatch}`);
  console.log(`- import_cursor: last_page=${postCursor?.last_page}, total_imported=${postCursor?.total_imported}, last_id=${postCursor?.last_imported_id}`);
  console.log(`- budget_tracker: writes=${postBudget?.rows_written}, reads=${postBudget?.rows_read}, imported=${postBudget?.records_imported}`);
  console.log(`- Final database size: ${finalSize} bytes (${(finalSize / (1024 * 1024)).toFixed(2)} MB, ${(finalSize / (1024 * 1024)).toFixed(3)} MiB)`);
  console.log(`- Average footprint: ${bytesPerRecord} bytes / record`);

  // 6. Search Verification for newly ingested titles
  console.log("\n[Step 6] Testing FTS search on sample shows from Page 5 and Page 6...");

  // Sample show from Page 5 (pick first)
  const sampleP5 = itemsP5[0];
  const searchP5 = executeRemoteSqlCommand(`
    SELECT c.item_id, c.id, c.title, c.release_year, c.primary_genre,
      (CASE WHEN c.normalized_title = '${sampleP5.normalizedTitle.replace(/'/g, "''")}' THEN 100.0 ELSE 0.0 END) +
      (-bm25(catalog_fts, 10.0, 5.0, 2.0, 1.0, 4.0) * 20.0) AS composite_score
    FROM catalog_fts f JOIN catalog_items c ON f.rowid = c.item_id
    WHERE catalog_fts MATCH '${sampleP5.title.replace(/'/g, "''")}'
    ORDER BY composite_score DESC LIMIT 2;
  `);
  console.log(`Search Page 5 show '${sampleP5.title}' (ID: ${sampleP5.id}):`, searchP5[0]?.results);

  // Sample show from Page 6 (pick first)
  const sampleP6 = itemsP6[0];
  const searchP6 = executeRemoteSqlCommand(`
    SELECT c.item_id, c.id, c.title, c.release_year, c.primary_genre,
      (CASE WHEN c.normalized_title = '${sampleP6.normalizedTitle.replace(/'/g, "''")}' THEN 100.0 ELSE 0.0 END) +
      (-bm25(catalog_fts, 10.0, 5.0, 2.0, 1.0, 4.0) * 20.0) AS composite_score
    FROM catalog_fts f JOIN catalog_items c ON f.rowid = c.item_id
    WHERE catalog_fts MATCH '${sampleP6.title.replace(/'/g, "''")}'
    ORDER BY composite_score DESC LIMIT 2;
  `);
  console.log(`Search Page 6 show '${sampleP6.title}' (ID: ${sampleP6.id}):`, searchP6[0]?.results);

  console.log("\n=== Phase 5AW Controlled Ingestion Completed Successfully ===");
}

runPhase5AWPages5And6().catch(console.error);
