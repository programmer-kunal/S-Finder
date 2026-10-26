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

async function auditProvenance() {
  console.log("=== S Finder Phase 5AZ: TVMaze Provenance & ID Range Audit ===");

  // 1. Fetch live ranges from TVMaze for Pages 0 through 16
  console.log("\nAuditing documented TVMaze page boundaries (Pages 0..16)...");
  const pageExpectations: Array<{ page: number; minId: number; maxId: number; count: number; firstTitle: string; lastTitle: string }> = [];

  for (let p = 0; p <= 16; p++) {
    const res = await fetch(`https://api.tvmaze.com/shows?page=${p}`, {
      headers: { "User-Agent": "SFinder-Audit/1.0" }
    });
    const shows = await res.json() as any[];
    const firstShow = shows[0];
    const lastShow = shows[shows.length - 1];
    pageExpectations.push({
      page: p,
      minId: firstShow.id,
      maxId: lastShow.id,
      count: shows.length,
      firstTitle: firstShow.name,
      lastTitle: lastShow.name
    });
    await new Promise(r => setTimeout(r, 200));
  }

  console.log("\nDocumented TVMaze API Page Ranges:");
  console.table(pageExpectations);

  // 2. Query remote D1 to verify the counts of records residing in each page boundary
  console.log("\nVerifying remote D1 catalog items within each documented page boundary...");
  const d1PageAudits: any[] = [];

  for (const exp of pageExpectations) {
    const rangeMin = exp.page * 250;
    const rangeMax = (exp.page + 1) * 250 - 1;

    const q = executeRemoteSqlCommand(`
      SELECT
        count(*) as count,
        min(CAST(provider_id AS INTEGER)) as min_id,
        max(CAST(provider_id AS INTEGER)) as max_id
      FROM catalog_items
      WHERE CAST(provider_id AS INTEGER) BETWEEN ${rangeMin} AND ${rangeMax};
    `);
    const r = q[0]?.results?.[0];
    d1PageAudits.push({
      page: exp.page,
      expectedCount: exp.count,
      actualCountInD1: r?.count,
      expectedMinId: exp.minId,
      actualMinIdInD1: r?.min_id,
      expectedMaxId: exp.maxId,
      actualMaxIdInD1: r?.max_id,
      matchesExpected: r?.count === exp.count && r?.min_id === exp.minId && r?.max_id === exp.maxId
    });
  }

  console.log("\nRemote D1 Page Boundary Audit Results:");
  console.table(d1PageAudits);

  const allMatched = d1PageAudits.every(a => a.matchesExpected);
  console.log(`\nAll 17 pages (0..16) match TVMaze 100%: ${allMatched}`);

  // 3. Check specific shows: Daria (2554), Gargoyles (1898), Frozen Planet (4000)
  console.log("\nVerifying specific show provenance:");
  const specificShows = executeRemoteSqlCommand(`
    SELECT item_id, id, provider_id, title, release_year, primary_genre
    FROM catalog_items
    WHERE id IN ('tvmaze-1898', 'tvmaze-2554', 'tvmaze-4000', 'tvmaze-2250');
  `);
  console.table(specificShows[0]?.results);

  // 4. Check for any gaps, duplicates, or out-of-range IDs in D1
  const integrity = executeRemoteSqlCommand(`
    SELECT count(*) as total_items FROM catalog_items;
    SELECT count(DISTINCT id) as unique_ids FROM catalog_items;
    SELECT count(*) as total_fts FROM catalog_fts;
    SELECT count(*) as mismatches FROM catalog_items c JOIN catalog_fts f ON c.id = f.id WHERE c.item_id != f.rowid;
    SELECT min(CAST(provider_id AS INTEGER)) as global_min_id, max(CAST(provider_id AS INTEGER)) as global_max_id FROM catalog_items;
    SELECT count(*) as out_of_range FROM catalog_items WHERE CAST(provider_id AS INTEGER) < 1 OR CAST(provider_id AS INTEGER) > 4249;
  `);

  console.log("\nDatabase Completeness & Integrity Metrics:");
  console.log("- Total Items:", integrity[0]?.results?.[0]?.total_items);
  console.log("- Unique IDs:", integrity[1]?.results?.[0]?.unique_ids);
  console.log("- Total FTS:", integrity[2]?.results?.[0]?.total_fts);
  console.log("- Key Mismatches:", integrity[3]?.results?.[0]?.mismatches);
  console.log("- Global Min ID:", integrity[4]?.results?.[0]?.global_min_id);
  console.log("- Global Max ID:", integrity[4]?.results?.[0]?.global_max_id);
  console.log("- Out-of-Range IDs (>4249 or <1):", integrity[5]?.results?.[0]?.out_of_range);
}

auditProvenance().catch(console.error);
