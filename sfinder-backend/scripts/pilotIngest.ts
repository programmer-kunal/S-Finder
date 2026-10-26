import fs from "node:fs";
import path from "node:path";
import { NodeSqliteAdapter } from "../test/catalog/sqliteAdapter";
import { CatalogRepository } from "../src/catalog/catalogRepository";
import { CatalogIngestor } from "../src/catalog/ingestor";
import { BroadDiscoveryEngine } from "../src/catalog/discoveryEngine";

async function runPilot() {
  const sqliteFile = path.resolve(
    __dirname,
    "../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite"
  );

  console.log("Using Local SQLite DB:", sqliteFile);
  const initialSize = fs.statSync(sqliteFile).size;
  console.log(`Initial DB file size: ${(initialSize / 1024).toFixed(2)} KB`);

  const { DatabaseSync } = await import("node:sqlite");
  const rawDb = new DatabaseSync(sqliteFile);
  const db = new NodeSqliteAdapter(rawDb);
  const repo = new CatalogRepository(db);
  const ingestor = new CatalogIngestor(db, {
    delayBetweenPagesMs: 250 // polite rate
  });

  console.log("\n--- Starting Pilot TVMaze Ingestion (Pages 0 and 1, max 500 shows) ---");
  const startTime = Date.now();
  const summary = await ingestor.ingestTvMaze({
    maxPagesPerRun: 2,
    delayBetweenPagesMs: 200
  });
  const elapsed = Date.now() - startTime;

  console.log("\n--- Ingestion Result ---");
  console.log(`Pages Processed: ${summary.pagesProcessed}`);
  console.log(`Records Imported: ${summary.recordsImported}`);
  console.log(`Last Page Index: ${summary.lastPage}`);
  console.log(`Has More Pages: ${summary.hasMorePages}`);
  console.log(`Elapsed Time: ${elapsed} ms`);

  // Cursor status
  const cursor = await repo.getCursor("TVMAZE");
  console.log("\n--- Ingestion Cursor Checkpoint ---");
  console.log(JSON.stringify(cursor, null, 2));

  // Check file size after import (checkpoint WAL to get exact file size)
  try {
    db.rawDb.exec("PRAGMA wal_checkpoint(FULL);");
  } catch (e) {
    // ignore
  }

  const finalSize = fs.statSync(sqliteFile).size;
  const growthBytes = finalSize - initialSize;
  console.log(`\nFinal DB file size: ${(finalSize / 1024).toFixed(2)} KB`);
  console.log(`DB Size Growth: ${(growthBytes / 1024).toFixed(2)} KB`);
  if (summary.recordsImported > 0) {
    console.log(`Average bytes per record: ${(growthBytes / summary.recordsImported).toFixed(0)} bytes`);
  }

  // Row counts
  const countRow = db.rawDb.prepare("SELECT count(*) as count FROM catalog_items;").get() as any;
  console.log(`\nTotal catalog_items in DB: ${countRow.count}`);

  const ftsCountRow = db.rawDb.prepare("SELECT count(*) as count FROM catalog_fts;").get() as any;
  console.log(`Total catalog_fts entries in DB: ${ftsCountRow.count}`);

  // Test Search
  console.log("\n--- Testing Search via BroadDiscoveryEngine ---");
  const engine = new BroadDiscoveryEngine(db);

  const testQueries = [
    { query: "Under the Dome", label: "Exact Title Search" },
    { query: "small town mystery transparent dome", label: "Plot / Context Search" },
    { query: "rivalry and tension", label: "Trope / Concept Search" }
  ];

  for (const tq of testQueries) {
    const sStart = Date.now();
    const result = await engine.discover({ query: tq.query, page: 1, limit: 5 });
    const sElapsed = Date.now() - sStart;
    console.log(`\nQuery: "${tq.query}" (${tq.label})`);
    console.log(`Matched: ${result.totalCount} (Resolved: ${result.resolvedCount}) in ${sElapsed} ms`);
    for (const item of result.items.slice(0, 3)) {
      console.log(`  - [${item.mediaType}] ${item.title} (${item.releaseYear}) | Rating: ${item.rating ?? "N/A"} | ${item.matchExplanation}`);
    }
  }

  // EXPLAIN QUERY PLAN
  console.log("\n--- EXPLAIN QUERY PLAN ---");
  const plan = await repo.explainSearchPlan("small town mystery");
  for (const row of plan) {
    console.log(`  id=${row.id} parent=${row.parent} detail=${row.detail}`);
  }
}

runPilot().catch(err => {
  console.error("Pilot ingestion failed:", err);
  process.exit(1);
});
