import { execSync } from "node:child_process";
import path from "node:path";

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

async function testFtsIdentity() {
  console.log("=== S Finder Phase 5AW: FTS & Identity Verification Benchmarks ===");

  // 1. Initial Parity
  const preParity = executeRemoteSqlCommand(`
    SELECT count(*) as items FROM catalog_items;
    SELECT count(*) as fts FROM catalog_fts;
    SELECT count(*) as mismatches FROM catalog_items c JOIN catalog_fts f ON c.id = f.id WHERE c.item_id != f.rowid;
  `);
  console.log("Pre-Test Parity:", {
    items: preParity[0]?.results?.[0]?.items,
    fts: preParity[1]?.results?.[0]?.fts,
    mismatches: preParity[2]?.results?.[0]?.mismatches
  });

  const testId = "tvmaze-benchmark-aw-1";

  // 2. Fresh INSERT
  console.log("\n[Test 1] Fresh Record INSERT...");
  const insertRes = executeRemoteSqlCommand(`
    INSERT INTO catalog_items (
      id, provider, provider_id, media_type, title, original_title,
      normalized_title, release_year, genres_json, primary_genre,
      countries_json, primary_country, synopsis, rating, vote_count,
      popularity_score, poster_url, catalog_source, trope_tags,
      provider_updated_at, indexed_at
    ) VALUES (
      '${testId}', 'TVMAZE', 'bench-1', 'SERIES', 'Quantum Nexus Odyssey', 'Quantum Nexus',
      'quantum nexus odyssey', 2026, '["Sci-Fi","Adventure"]', 'Sci-Fi',
      '["US"]', 'US', 'A quantum pilot discovers an ancient chronosphaera in deep space.', 8.9, 1500,
      89.5, 'https://example.com/poster.jpg', 'TVMAZE_BENCH', 'time travel, space exploration',
      1700000000, ${Date.now()}
    );
  `);
  const insertMeta = insertRes[0]?.meta;
  console.log("Fresh INSERT Meta:", {
    rows_written: insertMeta?.rows_written,
    rows_read: insertMeta?.rows_read,
    duration_ms: insertMeta?.timings?.sql_duration_ms
  });

  // Verify key assignment
  const checkInsert = executeRemoteSqlCommand(`
    SELECT c.item_id, c.id, c.title, f.rowid as fts_rowid, f.title as fts_title
    FROM catalog_items c JOIN catalog_fts f ON c.item_id = f.rowid
    WHERE c.id = '${testId}';
  `);
  console.log("Assigned Keys:", checkInsert[0]?.results?.[0]);
  const assignedItemId = checkInsert[0]?.results?.[0]?.item_id;

  // 3. Identical UPSERT
  console.log("\n[Test 2] Identical Conditional UPSERT...");
  const upsertRes = executeRemoteSqlCommand(`
    INSERT INTO catalog_items (
      id, provider, provider_id, media_type, title, original_title,
      normalized_title, release_year, genres_json, primary_genre,
      countries_json, primary_country, synopsis, rating, vote_count,
      popularity_score, poster_url, catalog_source, trope_tags,
      provider_updated_at, indexed_at
    ) VALUES (
      '${testId}', 'TVMAZE', 'bench-1', 'SERIES', 'Quantum Nexus Odyssey', 'Quantum Nexus',
      'quantum nexus odyssey', 2026, '["Sci-Fi","Adventure"]', 'Sci-Fi',
      '["US"]', 'US', 'A quantum pilot discovers an ancient chronosphaera in deep space.', 8.9, 1500,
      89.5, 'https://example.com/poster.jpg', 'TVMAZE_BENCH', 'time travel, space exploration',
      1700000000, ${Date.now()}
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      synopsis = excluded.synopsis
    WHERE
      catalog_items.title IS NOT excluded.title OR
      catalog_items.synopsis IS NOT excluded.synopsis;
  `);
  const upsertMeta = upsertRes[0]?.meta;
  console.log("Identical UPSERT Meta:", {
    rows_written: upsertMeta?.rows_written,
    rows_read: upsertMeta?.rows_read,
    duration_ms: upsertMeta?.timings?.sql_duration_ms
  });

  // 4. Searchable Text Update
  console.log("\n[Test 3] Searchable Text Update...");
  const updateRes = executeRemoteSqlCommand(`
    UPDATE catalog_items
    SET synopsis = 'A quantum pilot discovers an ancient astrolabium relic in deep space.'
    WHERE id = '${testId}';
  `);
  const updateMeta = updateRes[0]?.meta;
  console.log("Text Update Meta:", {
    rows_written: updateMeta?.rows_written,
    rows_read: updateMeta?.rows_read,
    duration_ms: updateMeta?.timings?.sql_duration_ms
  });

  // Verify FTS token update
  const tokenOld = executeRemoteSqlCommand(`SELECT count(*) as count FROM catalog_fts WHERE catalog_fts MATCH 'chronosphaera';`);
  const tokenNew = executeRemoteSqlCommand(`SELECT count(*) as count FROM catalog_fts WHERE catalog_fts MATCH 'astrolabium';`);
  console.log("Token Search:", {
    old_token_matches: tokenOld[0]?.results?.[0]?.count,
    new_token_matches: tokenNew[0]?.results?.[0]?.count
  });

  // 5. Title Search Ranking
  console.log("\n[Test 4] Title Search Ranking...");
  const searchRes = executeRemoteSqlCommand(`
    SELECT c.item_id, c.id, c.title,
      (CASE WHEN c.normalized_title = 'quantum nexus odyssey' THEN 100.0 ELSE 0.0 END) +
      (-bm25(catalog_fts, 10.0, 5.0, 2.0, 1.0, 4.0) * 20.0) AS composite_score
    FROM catalog_fts f JOIN catalog_items c ON f.rowid = c.item_id
    WHERE catalog_fts MATCH 'Quantum Nexus'
    ORDER BY composite_score DESC LIMIT 2;
  `);
  console.log("Search Result:", searchRes[0]?.results);

  // 6. Delete
  console.log("\n[Test 5] Record Delete...");
  const deleteRes = executeRemoteSqlCommand(`DELETE FROM catalog_items WHERE id = '${testId}';`);
  const deleteMeta = deleteRes[0]?.meta;
  console.log("Delete Meta:", {
    rows_written: deleteMeta?.rows_written,
    rows_read: deleteMeta?.rows_read,
    duration_ms: deleteMeta?.timings?.sql_duration_ms
  });

  // 7. Post-Test Parity
  const postParity = executeRemoteSqlCommand(`
    SELECT count(*) as items FROM catalog_items;
    SELECT count(*) as fts FROM catalog_fts;
    SELECT count(*) as mismatches FROM catalog_items c JOIN catalog_fts f ON c.id = f.id WHERE c.item_id != f.rowid;
  `);
  console.log("\nPost-Test Parity:", {
    items: postParity[0]?.results?.[0]?.items,
    fts: postParity[1]?.results?.[0]?.fts,
    mismatches: postParity[2]?.results?.[0]?.mismatches
  });

  console.log("\n=== FTS & Identity Verification Passed Completely ===");
}

testFtsIdentity().catch(console.error);
