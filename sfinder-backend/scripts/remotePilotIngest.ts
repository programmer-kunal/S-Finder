import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { CatalogIngestor } from "../src/catalog/ingestor";
import { CatalogItem } from "../src/catalog/types";

// Helper to escape SQL strings safely
function sqlStr(val: any): string {
  if (val === null || val === undefined) return "NULL";
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

function sqlNum(val: any): string {
  if (val === null || val === undefined || isNaN(val)) return "NULL";
  return String(val);
}

async function fetchPage(pageIndex: number): Promise<any[]> {
  const url = `https://api.tvmaze.com/shows?page=${pageIndex}`;
  console.log(`Fetching TVmaze page ${pageIndex}: ${url}`);

  let attempts = 0;
  while (attempts < 4) {
    const res = await fetch(url, {
      headers: { "User-Agent": "SFinder-PilotIngestion/1.0", "Accept": "application/json" }
    });

    if (res.status === 429) {
      attempts++;
      const waitMs = attempts * 2000;
      console.log(`  Rate limit 429 hit. Backing off for ${waitMs}ms...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error(`Failed to fetch page ${pageIndex}: HTTP ${res.status}`);
    }

    return await res.json() as any[];
  }

  throw new Error(`Rate limit exceeded for page ${pageIndex} after retries`);
}

function generateBatchSql(items: CatalogItem[], pageIndex: number, totalCumulative: number): string {
  const lines: string[] = [];

  for (const item of items) {
    // High-efficiency SQLite UPSERT: avoids redundant DELETEs, preserves FTS triggers
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
  // Update checkpoint cursor
  lines.push(`INSERT OR REPLACE INTO import_cursor (
    provider, last_page, total_imported, last_imported_id, status, error_message, updated_at
  ) VALUES (
    'TVMAZE', ${pageIndex + 1}, ${totalCumulative}, ${sqlStr(lastId)}, 'IN_PROGRESS', NULL, ${Date.now()}
  );`);

  return lines.join("\n");
}

async function runRemotePilot() {
  console.log("=== S Finder Phase 5AR: Remote Cloudflare D1 Bounded Pilot Ingestion ===");

  const ingestor = new CatalogIngestor(null as any);
  let totalImported = 0;

  // Process Page 0
  const showsPage0 = await fetchPage(0);
  console.log(`Page 0 fetched: ${showsPage0.length} raw shows`);

  const normalizedPage0: CatalogItem[] = [];
  for (const raw of showsPage0) {
    const item = ingestor.normalizeTvMazeShow(raw);
    if (item) normalizedPage0.push(item);
  }
  totalImported += normalizedPage0.length;
  console.log(`Page 0 normalized: ${normalizedPage0.length} catalog items`);

  const sqlPage0 = generateBatchSql(normalizedPage0, 0, totalImported);
  const tempSql0 = path.resolve(__dirname, "temp_pilot_page0.sql");
  fs.writeFileSync(tempSql0, sqlPage0, "utf8");

  console.log("Executing Page 0 migration to remote D1...");
  const out0 = execSync(`npx wrangler d1 execute DB --remote --file="${tempSql0}"`, {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8"
  });
  console.log(out0);
  fs.unlinkSync(tempSql0);

  // Polite delay between pages
  console.log("Waiting 1,500ms before fetching Page 1...");
  await new Promise(r => setTimeout(r, 1500));

  // Process Page 1
  const showsPage1 = await fetchPage(1);
  console.log(`Page 1 fetched: ${showsPage1.length} raw shows`);

  const normalizedPage1: CatalogItem[] = [];
  for (const raw of showsPage1) {
    const item = ingestor.normalizeTvMazeShow(raw);
    if (item) normalizedPage1.push(item);
  }
  totalImported += normalizedPage1.length;
  console.log(`Page 1 normalized: ${normalizedPage1.length} catalog items (Cumulative: ${totalImported})`);

  const sqlPage1 = generateBatchSql(normalizedPage1, 1, totalImported);
  const tempSql1 = path.resolve(__dirname, "temp_pilot_page1.sql");
  fs.writeFileSync(tempSql1, sqlPage1, "utf8");

  console.log("Executing Page 1 migration to remote D1...");
  const out1 = execSync(`npx wrangler d1 execute DB --remote --file="${tempSql1}"`, {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8"
  });
  console.log(out1);
  fs.unlinkSync(tempSql1);

  console.log("\n=== Pilot Ingestion Complete ===");
  console.log(`Total Records Imported: ${totalImported}`);

  // Query remote metrics and state
  console.log("\n--- Remote Database Audit ---");
  const auditCmd = `npx wrangler d1 execute DB --remote --command="SELECT count(*) as total_items FROM catalog_items; SELECT count(*) as total_fts FROM catalog_fts; SELECT * FROM import_cursor WHERE provider = 'TVMAZE';"`;
  const auditOut = execSync(auditCmd, {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8"
  });
  console.log(auditOut);

  // Run Test Search on Remote D1
  console.log("\n--- Testing Search on Remote D1 ---");
  const searchCmd = `npx wrangler d1 execute DB --remote --command="SELECT c.id, c.title, c.release_year, c.rating, (-bm25(catalog_fts, 10.0, 5.0, 2.0, 1.0, 4.0) * 20.0) as text_relevance FROM catalog_fts f JOIN catalog_items c ON f.id = c.id WHERE catalog_fts MATCH 'Under OR Dome' ORDER BY text_relevance DESC LIMIT 3;"`;
  const searchOut = execSync(searchCmd, {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8"
  });
  console.log(searchOut);
}

runRemotePilot().catch(err => {
  console.error("Remote pilot failed:", err);
  process.exit(1);
});
