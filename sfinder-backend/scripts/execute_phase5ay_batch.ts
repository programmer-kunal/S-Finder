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

  // In-place update for cursor (exactly 1 write, avoids DELETE+INSERT row write churn)
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

interface PageResult {
  pageIndex: number;
  rawCount: number;
  normalizedCount: number;
  rowsWritten: number;
  rowsRead: number;
  durationMs: number;
  sizeAfterBytes: number;
  cumulativeItems: number;
  dailyWritesUsed: number;
  remainingDailyBudget: number;
}

async function runPhase5AYBatch() {
  console.log("=== S Finder Phase 5AY: Controlled Series Ingestion Toward 10,000 Records ===");

  const nowUtc = new Date();
  const todayUtc = nowUtc.toISOString().substring(0, 10);
  console.log(`Current UTC Timestamp: ${nowUtc.toISOString()} (Date Bucket: ${todayUtc})`);

  const maxDailyBudget = 35_000;
  const worstCasePageCost = 250 * 11 + 4; // ~2,754 writes
  const maxPagesToIngest = 8; // At most 8 pages on UTC day 2026-10-25 (total 10 for the day)
  const ingestor = new CatalogIngestor(null as any);

  // 1. Preflight State Check
  console.log("\n[Preflight] Checking live remote D1 state before ingestion...");
  const preCheck = executeRemoteSqlCommand(`
    SELECT count(*) as items FROM catalog_items;
    SELECT count(*) as fts FROM catalog_fts;
    SELECT count(*) as mismatches FROM catalog_items c JOIN catalog_fts f ON c.id = f.id WHERE c.item_id != f.rowid;
    SELECT * FROM import_cursor WHERE provider = 'TVMAZE';
    SELECT * FROM ingestion_budget_tracker WHERE day_utc = '${todayUtc}';
  `);

  let currentItems = Number(preCheck[0]?.results?.[0]?.items);
  let currentFts = Number(preCheck[1]?.results?.[0]?.fts);
  let currentMismatch = Number(preCheck[2]?.results?.[0]?.mismatches);
  const preCursor = preCheck[3]?.results?.[0];
  const todayTracker = preCheck[4]?.results?.[0];

  let currentDailyWrites = Number(todayTracker?.rows_written ?? 0);
  let startPage = Number(preCursor?.last_page ?? 0);
  let cumulativeImported = Number(preCursor?.total_imported ?? 0);

  console.log(`Preflight State:`);
  console.log(`- catalog_items: ${currentItems}, catalog_fts: ${currentFts}, mismatches: ${currentMismatch}`);
  console.log(`- cursor: last_page=${startPage}, total_imported=${cumulativeImported}, last_id=${preCursor?.last_imported_id}`);
  console.log(`- today's writes (${todayUtc}): ${currentDailyWrites} / ${maxDailyBudget} (Remaining: ${maxDailyBudget - currentDailyWrites})`);

  if (currentItems !== 2148 || currentFts !== 2148 || currentMismatch !== 0 || startPage !== 9) {
    throw new Error(`Pre-conditions failed! items=${currentItems}, fts=${currentFts}, mismatches=${currentMismatch}, last_page=${startPage}`);
  }

  const results: PageResult[] = [];
  const endPage = startPage + maxPagesToIngest - 1; // 9 + 8 - 1 = 16
  console.log(`\nAuthorized ingestion window: Pages ${startPage} through ${endPage} (${maxPagesToIngest} pages maximum).`);

  for (let page = startPage; page <= endPage; page++) {
    const remainingBudget = maxDailyBudget - currentDailyWrites;
    console.log(`\n------------------------------------------------------------`);
    console.log(`[Batch Step] Preparing Page ${page}... (Remaining Budget: ${remainingBudget} writes)`);

    // Guardrail: verify adequate headroom for worst-case page
    if (remainingBudget < worstCasePageCost) {
      console.warn(`Budget ceiling safety stop: remaining budget (${remainingBudget}) is less than worst-case page cost (${worstCasePageCost}). Halting.`);
      break;
    }

    // 1. Fetch TVMaze Page
    console.log(`Fetching https://api.tvmaze.com/shows?page=${page}...`);
    const res = await fetch(`https://api.tvmaze.com/shows?page=${page}`, {
      headers: { "User-Agent": "SFinder-Phase5AY-Ingestion/1.0", "Accept": "application/json" }
    });
    if (!res.ok) {
      throw new Error(`TVMaze API returned HTTP ${res.status} on Page ${page}`);
    }
    const rawShows = await res.json() as any[];
    console.log(`Fetched ${rawShows.length} raw shows from Page ${page}.`);

    // 2. Normalize Shows
    const normalizedItems: CatalogItem[] = [];
    for (const raw of rawShows) {
      const item = ingestor.normalizeTvMazeShow(raw);
      if (item) normalizedItems.push(item);
    }
    cumulativeImported += normalizedItems.length;
    console.log(`Normalized ${normalizedItems.length} valid catalog items. New cumulative target: ${cumulativeImported}`);

    // 3. Generate SQL & Execute on Remote D1
    const sql = generatePageSql(normalizedItems, page, cumulativeImported);
    const tmpFile = path.resolve(__dirname, `temp_pilot_page${page}_${Date.now()}.sql`);
    fs.writeFileSync(tmpFile, sql, "utf8");

    console.log(`Executing Page ${page} SQL file on remote D1 (${normalizedItems.length} items)...`);
    const d1Res = executeRemoteSqlFile(tmpFile);
    fs.unlinkSync(tmpFile);

    const meta = d1Res[0]?.meta;
    const pageWrites = Number(meta?.rows_written ?? (normalizedItems.length * 11 + 1));
    const pageReads = Number(meta?.rows_read ?? 0);
    const durationMs = Number(meta?.timings?.sql_duration_ms ?? 0);
    const sizeAfter = Number(meta?.size_after ?? 0);

    // 4. Update Budget Tracker (+ 1 for tracker write itself)
    const trackerUpdateSql = `
      INSERT INTO ingestion_budget_tracker (
        day_utc, rows_written, rows_read, records_imported, batches_processed, updated_at
      ) VALUES (
        '${todayUtc}', ${pageWrites} + 1, ${pageReads} + 1, ${normalizedItems.length}, 1, ${Date.now()}
      )
      ON CONFLICT(day_utc) DO UPDATE SET
        rows_written = rows_written + excluded.rows_written,
        rows_read = rows_read + excluded.rows_read,
        records_imported = records_imported + excluded.records_imported,
        batches_processed = batches_processed + excluded.batches_processed,
        updated_at = excluded.updated_at;
    `;
    executeRemoteSqlCommand(trackerUpdateSql);

    currentDailyWrites += (pageWrites + 1);

    // 5. Parity & Key Alignment Verification
    const parityCheck = executeRemoteSqlCommand(`
      SELECT count(*) as items FROM catalog_items;
      SELECT count(*) as fts FROM catalog_fts;
      SELECT count(*) as mismatches FROM catalog_items c JOIN catalog_fts f ON c.id = f.id WHERE c.item_id != f.rowid;
    `);
    const liveItems = Number(parityCheck[0]?.results?.[0]?.items);
    const liveFts = Number(parityCheck[1]?.results?.[0]?.fts);
    const liveMismatches = Number(parityCheck[2]?.results?.[0]?.mismatches);

    if (liveItems !== liveFts || liveMismatches !== 0 || liveItems !== cumulativeImported) {
      throw new Error(`Inconsistency detected after Page ${page}! items=${liveItems}, fts=${liveFts}, expected=${cumulativeImported}, mismatches=${liveMismatches}`);
    }

    const pageResult: PageResult = {
      pageIndex: page,
      rawCount: rawShows.length,
      normalizedCount: normalizedItems.length,
      rowsWritten: pageWrites,
      rowsRead: pageReads,
      durationMs,
      sizeAfterBytes: sizeAfter,
      cumulativeItems: liveItems,
      dailyWritesUsed: currentDailyWrites,
      remainingDailyBudget: maxDailyBudget - currentDailyWrites
    };
    results.push(pageResult);

    console.log(`Page ${page} Complete: writes=${pageWrites}, reads=${pageReads}, duration=${durationMs.toFixed(1)}ms, cumulative=${liveItems}, remainingBudget=${maxDailyBudget - currentDailyWrites}`);

    // Polite delay before next fetch
    if (page < endPage) {
      console.log(`Polite delay: waiting 1,500ms before fetching Page ${page + 1}...`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // 6. Final State Checks & Search Validation
  console.log("\n============================================================");
  console.log("=== Final Post-Batch Verification & Search Ranking ===");
  const postCheck = executeRemoteSqlCommand(`
    SELECT count(*) as items FROM catalog_items;
    SELECT count(*) as fts FROM catalog_fts;
    SELECT count(*) as mismatches FROM catalog_items c JOIN catalog_fts f ON c.id = f.id WHERE c.item_id != f.rowid;
    SELECT * FROM import_cursor WHERE provider = 'TVMAZE';
    SELECT * FROM ingestion_budget_tracker ORDER BY day_utc DESC;
  `);

  const finalItems = Number(postCheck[0]?.results?.[0]?.items);
  const finalFts = Number(postCheck[1]?.results?.[0]?.fts);
  const finalMismatches = Number(postCheck[2]?.results?.[0]?.mismatches);
  const finalCursor = postCheck[3]?.results?.[0];
  const finalLedgers = postCheck[4]?.results as any[];

  const finalSize = results.length > 0 ? results[results.length - 1].sizeAfterBytes : 4497408;
  const bytesPerRecord = (finalSize / finalItems).toFixed(1);

  console.log(`\nFinal State Summary:`);
  console.log(`- Total Pages Processed in Phase 5AY: ${results.length}`);
  console.log(`- catalog_items: ${finalItems}`);
  console.log(`- catalog_fts:   ${finalFts}`);
  console.log(`- item_id/rowid mismatches: ${finalMismatches}`);
  console.log(`- import_cursor: last_page=${finalCursor?.last_page}, total_imported=${finalCursor?.total_imported}, last_id=${finalCursor?.last_imported_id}`);
  console.log(`- Multi-Day Budget Tracker:`, finalLedgers);
  console.log(`- Final database size: ${finalSize} bytes (${(finalSize / (1024 * 1024)).toFixed(2)} MB, ${(finalSize / (1024 * 1024)).toFixed(3)} MiB)`);
  console.log(`- Average footprint: ${bytesPerRecord} bytes / record`);

  // Verify no benchmark or synthetic records exist
  const benchmarkCheck = executeRemoteSqlCommand(`
    SELECT count(*) as test_items FROM catalog_items WHERE id LIKE 'tvmaze-benchmark%';
    SELECT count(*) as test_tokens FROM catalog_fts WHERE catalog_fts MATCH 'astrolabium OR chronosphaera OR chronosphere';
  `);
  console.log(`- Synthetic Benchmark Artifacts Check: items=${benchmarkCheck[0]?.results?.[0]?.test_items}, tokens=${benchmarkCheck[1]?.results?.[0]?.test_tokens}`);

  // Live Title Search Validations (at least two newly ingested shows)
  console.log("\nTesting FTS search on newly ingested titles...");

  // Search 1: Show from Page 9 ("Daria", ID: tvmaze-2250)
  const search1 = executeRemoteSqlCommand(`
    SELECT c.item_id, c.id, c.title, c.release_year, c.primary_genre,
      (CASE WHEN c.normalized_title = 'daria' THEN 100.0 ELSE 0.0 END) +
      (-bm25(catalog_fts, 10.0, 5.0, 2.0, 1.0, 4.0) * 20.0) AS composite_score
    FROM catalog_fts f JOIN catalog_items c ON f.rowid = c.item_id
    WHERE catalog_fts MATCH 'daria'
    ORDER BY composite_score DESC LIMIT 2;
  `);
  console.log("Search 'Daria' (Page 9):", search1[0]?.results);

  // Search 2: Show from Page 16 ("Gargoyles", ID: tvmaze-4000)
  const search2 = executeRemoteSqlCommand(`
    SELECT c.item_id, c.id, c.title, c.release_year, c.primary_genre,
      (CASE WHEN c.normalized_title = 'gargoyles' THEN 100.0 ELSE 0.0 END) +
      (-bm25(catalog_fts, 10.0, 5.0, 2.0, 1.0, 4.0) * 20.0) AS composite_score
    FROM catalog_fts f JOIN catalog_items c ON f.rowid = c.item_id
    WHERE catalog_fts MATCH 'gargoyles'
    ORDER BY composite_score DESC LIMIT 2;
  `);
  console.log("Search 'Gargoyles' (Page 16):", search2[0]?.results);

  // Print Page-by-Page Table
  console.log("\n=== Page-by-Page Summary Table ===");
  console.table(results.map(r => ({
    Page: r.pageIndex,
    Raw: r.rawCount,
    Norm: r.normalizedCount,
    Writes: r.rowsWritten,
    Reads: r.rowsRead,
    DurationMs: `${r.durationMs.toFixed(1)}ms`,
    SizeMB: (r.sizeAfterBytes / (1024 * 1024)).toFixed(2),
    Cumulative: r.cumulativeItems,
    BudgetUsed: r.dailyWritesUsed,
    BudgetRemaining: r.remainingDailyBudget
  })));

  console.log("\n=== Phase 5AY Ingestion Completed Successfully ===");
}

runPhase5AYBatch().catch(console.error);
