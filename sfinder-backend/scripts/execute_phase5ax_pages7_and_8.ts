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

function generatePageSql(items: CatalogItem[], pageIndex: number, totalCumulative: number): string {
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

  // In-place update for cursor avoids DELETE+INSERT row write churn (exactly 1 write)
  lines.push(`INSERT INTO import_cursor (
    provider, last_page, total_imported, last_imported_id, status, error_message, updated_at
  ) VALUES (
    'TVMAZE', ${pageIndex + 1}, ${totalCumulative}, ${sqlStr(lastId)}, 'IN_PROGRESS', NULL, ${Date.now()}
  )
  ON CONFLICT(provider) DO UPDATE SET
    last_page = excluded.last_page,
    total_imported = excluded.total_imported,
    last_imported_id = excluded.last_imported_id,
    status = excluded.status,
    error_message = excluded.error_message,
    updated_at = excluded.updated_at;`);

  return lines.join("\n");
}

async function runPhase5AXPages7And8() {
  console.log("=== S Finder Phase 5AX: UTC Rollover & Guarded Ingestion of Pages 7 & 8 ===");

  const nowUtc = new Date();
  const todayUtc = nowUtc.toISOString().substring(0, 10);
  console.log(`Current UTC Timestamp: ${nowUtc.toISOString()} (Date Bucket: ${todayUtc})`);

  const maxDailyBudget = 35_000;
  const ingestor = new CatalogIngestor(null as any);

  // 1. Pre-Conditions and Budget Check
  console.log("\n[Step 1] Verifying Pre-Conditions and Multi-Day Ledger...");
  const preCheck = executeRemoteSqlCommand(`
    SELECT count(*) as items FROM catalog_items;
    SELECT count(*) as fts FROM catalog_fts;
    SELECT count(*) as mismatches FROM catalog_items c JOIN catalog_fts f ON c.id = f.id WHERE c.item_id != f.rowid;
    SELECT * FROM import_cursor WHERE provider = 'TVMAZE';
    SELECT * FROM ingestion_budget_tracker ORDER BY day_utc DESC;
  `);

  const preItems = Number(preCheck[0]?.results?.[0]?.items);
  const preFts = Number(preCheck[1]?.results?.[0]?.fts);
  const preMismatch = Number(preCheck[2]?.results?.[0]?.mismatches);
  const preCursor = preCheck[3]?.results?.[0];
  const allLedgers = preCheck[4]?.results as any[];

  console.log(`Pre-State:`);
  console.log(`- catalog_items: ${preItems}, catalog_fts: ${preFts}, mismatches: ${preMismatch}`);
  console.log(`- cursor: last_page=${preCursor?.last_page}, total_imported=${preCursor?.total_imported}, last_id=${preCursor?.last_imported_id}`);
  console.log(`- Historical Ledgers:`, allLedgers);

  const todayLedger = allLedgers.find((l: any) => l.day_utc === todayUtc);
  const currentDailyWrites = Number(todayLedger?.rows_written ?? 0);
  const remainingBudget = maxDailyBudget - currentDailyWrites;

  console.log(`Today's Budget Bucket (${todayUtc}):`);
  console.log(`- Current writes today: ${currentDailyWrites} / ${maxDailyBudget} (Remaining: ${remainingBudget})`);

  if (preItems !== 1675 || preFts !== 1675 || preMismatch !== 0 || Number(preCursor?.last_page) !== 7) {
    throw new Error(`Pre-conditions not met! items=${preItems}, fts=${preFts}, mismatches=${preMismatch}, last_page=${preCursor?.last_page}`);
  }

  const worstCasePageCost = 250 * 11 + 4; // ~2,754 writes
  if (remainingBudget < worstCasePageCost * 2) {
    throw new Error(`Insufficient budget for 2 pages: remaining ${remainingBudget} < ${worstCasePageCost * 2}`);
  }

  // 2. Process Page 7 (Shows 1750..1999)
  console.log("\n[Step 2] Processing Page 7 (Shows 1750..1999)...");
  const resP7 = await fetch("https://api.tvmaze.com/shows?page=7", {
    headers: { "User-Agent": "SFinder-Phase5AX-Ingestion/1.0", "Accept": "application/json" }
  });
  if (!resP7.ok) throw new Error(`TVMaze API returned HTTP ${resP7.status} on Page 7`);
  const rawP7 = await resP7.json() as any[];
  console.log(`Fetched ${rawP7.length} raw shows from Page 7.`);

  const itemsP7: CatalogItem[] = [];
  for (const raw of rawP7) {
    const item = ingestor.normalizeTvMazeShow(raw);
    if (item) itemsP7.push(item);
  }
  let cumulativeImported = preItems + itemsP7.length;
  console.log(`Normalized ${itemsP7.length} valid catalog items. Target cumulative: ${cumulativeImported}`);

  const sqlP7 = generatePageSql(itemsP7, 7, cumulativeImported);
  const tmpP7 = path.resolve(__dirname, `temp_pilot_page7_${Date.now()}.sql`);
  fs.writeFileSync(tmpP7, sqlP7, "utf8");

  console.log(`Executing Page 7 batch on remote D1 (${itemsP7.length} items)...`);
  const d1ResP7 = executeRemoteSqlFile(tmpP7);
  fs.unlinkSync(tmpP7);

  const metaP7 = d1ResP7[0]?.meta;
  console.log("Page 7 Execution Meta:", {
    rows_written: metaP7?.rows_written,
    rows_read: metaP7?.rows_read,
    duration_ms: metaP7?.timings?.sql_duration_ms,
    size_after_bytes: metaP7?.size_after,
    size_after_mb: (Number(metaP7?.size_after) / (1024 * 1024)).toFixed(2)
  });

  const p7Writes = Number(metaP7?.rows_written ?? 0);
  const p7Reads = Number(metaP7?.rows_read ?? 0);

  // Update budget tracker for Page 7 (+ 1 for tracker write) under todayUtc
  executeRemoteSqlCommand(`
    INSERT INTO ingestion_budget_tracker (
      day_utc, rows_written, rows_read, records_imported, batches_processed, updated_at
    ) VALUES (
      '${todayUtc}', ${p7Writes} + 1, ${p7Reads} + 1, ${itemsP7.length}, 1, ${Date.now()}
    )
    ON CONFLICT(day_utc) DO UPDATE SET
      rows_written = rows_written + excluded.rows_written,
      rows_read = rows_read + excluded.rows_read,
      records_imported = records_imported + excluded.records_imported,
      batches_processed = batches_processed + excluded.batches_processed,
      updated_at = excluded.updated_at;
  `);

  // Intermediate Parity Check between Page 7 and Page 8
  console.log("\n[Intermediate Check] Validating parity after Page 7...");
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
    throw new Error(`Inconsistency detected after Page 7! items=${midItems}, fts=${midFts}, expected=${cumulativeImported}`);
  }

  const remainingForP8 = maxDailyBudget - Number(midBudget?.rows_written);
  if (remainingForP8 < worstCasePageCost) {
    throw new Error(`Insufficient budget for Page 8: remaining ${remainingForP8} < ${worstCasePageCost}. Halting.`);
  }

  // Polite delay
  console.log("Waiting 1,500ms before fetching Page 8...");
  await new Promise(r => setTimeout(r, 1500));

  // 3. Process Page 8 (Shows 2000..2249)
  console.log("\n[Step 3] Processing Page 8 (Shows 2000..2249)...");
  const resP8 = await fetch("https://api.tvmaze.com/shows?page=8", {
    headers: { "User-Agent": "SFinder-Phase5AX-Ingestion/1.0", "Accept": "application/json" }
  });
  if (!resP8.ok) throw new Error(`TVMaze API returned HTTP ${resP8.status} on Page 8`);
  const rawP8 = await resP8.json() as any[];
  console.log(`Fetched ${rawP8.length} raw shows from Page 8.`);

  const itemsP8: CatalogItem[] = [];
  for (const raw of rawP8) {
    const item = ingestor.normalizeTvMazeShow(raw);
    if (item) itemsP8.push(item);
  }
  cumulativeImported += itemsP8.length;
  console.log(`Normalized ${itemsP8.length} valid catalog items. Target cumulative: ${cumulativeImported}`);

  const sqlP8 = generatePageSql(itemsP8, 8, cumulativeImported);
  const tmpP8 = path.resolve(__dirname, `temp_pilot_page8_${Date.now()}.sql`);
  fs.writeFileSync(tmpP8, sqlP8, "utf8");

  console.log(`Executing Page 8 batch on remote D1 (${itemsP8.length} items)...`);
  const d1ResP8 = executeRemoteSqlFile(tmpP8);
  fs.unlinkSync(tmpP8);

  const metaP8 = d1ResP8[0]?.meta;
  console.log("Page 8 Execution Meta:", {
    rows_written: metaP8?.rows_written,
    rows_read: metaP8?.rows_read,
    duration_ms: metaP8?.timings?.sql_duration_ms,
    size_after_bytes: metaP8?.size_after,
    size_after_mb: (Number(metaP8?.size_after) / (1024 * 1024)).toFixed(2)
  });

  const p8Writes = Number(metaP8?.rows_written ?? 0);
  const p8Reads = Number(metaP8?.rows_read ?? 0);

  // Update budget tracker for Page 8 (+ 1 for tracker write)
  executeRemoteSqlCommand(`
    UPDATE ingestion_budget_tracker
    SET rows_written = rows_written + ${p8Writes} + 1,
        rows_read = rows_read + ${p8Reads} + 1,
        records_imported = records_imported + ${itemsP8.length},
        batches_processed = batches_processed + 1,
        updated_at = ${Date.now()}
    WHERE day_utc = '${todayUtc}';
  `);

  // 4. Bounded Idempotent Verification on a Single Existing Item
  console.log("\n[Step 4] Bounded Idempotency Check on Single Record...");
  const sampleExisting = itemsP7[0];
  const idempotencySql = `
    INSERT INTO catalog_items (
      id, provider, provider_id, media_type, title, normalized_title, catalog_source, indexed_at
    ) VALUES (
      '${sampleExisting.id}', '${sampleExisting.provider}', '${sampleExisting.providerId}',
      '${sampleExisting.mediaType}', '${sampleExisting.title.replace(/'/g, "''")}',
      '${sampleExisting.normalizedTitle.replace(/'/g, "''")}', '${sampleExisting.catalogSource}',
      ${Date.now()}
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title
    WHERE
      catalog_items.title IS NOT excluded.title;
  `;
  const idempotencyRes = executeRemoteSqlCommand(idempotencySql);
  const idempotencyMeta = idempotencyRes[0]?.meta;
  console.log("Bounded Idempotency Test Meta:", {
    rows_written: idempotencyMeta?.rows_written,
    rows_read: idempotencyMeta?.rows_read,
    duration_ms: idempotencyMeta?.timings?.sql_duration_ms
  });

  // Account for this 1 sequence check write in today's tracker
  executeRemoteSqlCommand(`
    UPDATE ingestion_budget_tracker
    SET rows_written = rows_written + ${Number(idempotencyMeta?.rows_written ?? 1)} + 1,
        rows_read = rows_read + ${Number(idempotencyMeta?.rows_read ?? 3)} + 1,
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
    SELECT * FROM ingestion_budget_tracker ORDER BY day_utc DESC;
  `);

  const postItems = Number(postCheck[0]?.results?.[0]?.items);
  const postFts = Number(postCheck[1]?.results?.[0]?.fts);
  const postMismatch = Number(postCheck[2]?.results?.[0]?.mismatches);
  const postCursor = postCheck[3]?.results?.[0];
  const postLedgers = postCheck[4]?.results as any[];

  const finalSize = Number(metaP8?.size_after);
  const bytesPerRecord = (finalSize / postItems).toFixed(1);

  console.log(`\nFinal State Summary:`);
  console.log(`- catalog_items: ${postItems}`);
  console.log(`- catalog_fts:   ${postFts}`);
  console.log(`- item_id/rowid mismatches: ${postMismatch}`);
  console.log(`- import_cursor: last_page=${postCursor?.last_page}, total_imported=${postCursor?.total_imported}, last_id=${postCursor?.last_imported_id}`);
  console.log(`- Multi-Day Budget Tracker:`, postLedgers);
  console.log(`- Final database size: ${finalSize} bytes (${(finalSize / (1024 * 1024)).toFixed(2)} MB, ${(finalSize / (1024 * 1024)).toFixed(3)} MiB)`);
  console.log(`- Average footprint: ${bytesPerRecord} bytes / record`);

  // 6. Search Verification for newly ingested titles
  console.log("\n[Step 6] Testing FTS search on sample shows from Page 7 and Page 8...");

  // Sample show from Page 7 (pick first item)
  const searchP7 = executeRemoteSqlCommand(`
    SELECT c.item_id, c.id, c.title, c.release_year, c.primary_genre,
      (CASE WHEN c.normalized_title = '${sampleExisting.normalizedTitle.replace(/'/g, "''")}' THEN 100.0 ELSE 0.0 END) +
      (-bm25(catalog_fts, 10.0, 5.0, 2.0, 1.0, 4.0) * 20.0) AS composite_score
    FROM catalog_fts f JOIN catalog_items c ON f.rowid = c.item_id
    WHERE catalog_fts MATCH '${sampleExisting.title.replace(/'/g, "''")}'
    ORDER BY composite_score DESC LIMIT 2;
  `);
  console.log(`Search Page 7 show '${sampleExisting.title}' (ID: ${sampleExisting.id}):`, searchP7[0]?.results);

  // Sample show from Page 8 (pick first item)
  const sampleP8 = itemsP8[0];
  const searchP8 = executeRemoteSqlCommand(`
    SELECT c.item_id, c.id, c.title, c.release_year, c.primary_genre,
      (CASE WHEN c.normalized_title = '${sampleP8.normalizedTitle.replace(/'/g, "''")}' THEN 100.0 ELSE 0.0 END) +
      (-bm25(catalog_fts, 10.0, 5.0, 2.0, 1.0, 4.0) * 20.0) AS composite_score
    FROM catalog_fts f JOIN catalog_items c ON f.rowid = c.item_id
    WHERE catalog_fts MATCH '${sampleP8.title.replace(/'/g, "''")}'
    ORDER BY composite_score DESC LIMIT 2;
  `);
  console.log(`Search Page 8 show '${sampleP8.title}' (ID: ${sampleP8.id}):`, searchP8[0]?.results);

  console.log("\n=== Phase 5AX Guarded Ingestion Completed Successfully ===");
}

runPhase5AXPages7And8().catch(console.error);
