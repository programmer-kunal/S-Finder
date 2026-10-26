import { BENCHMARK_QUERIES, BenchmarkQuery } from "../test/catalog/benchmarkQueries";
import { buildFtsQuery } from "../src/catalog/tropes";
import { writeFileSync } from "node:fs";

function generateSqlForQuery(q: BenchmarkQuery): string {
  const trimmedQuery = q.query.trim();
  const ftsQuery = buildFtsQuery(trimmedQuery);
  const normalizedRaw = trimmedQuery.toLowerCase().replace(/[^\w\s]/g, "").trim();

  const whereClauses: string[] = [];
  if (q.filters?.mediaType && q.filters.mediaType !== "ALL") {
    whereClauses.push(`c.media_type = '${q.filters.mediaType}'`);
  }
  if (q.filters?.genre && q.filters.genre !== "ANY") {
    whereClauses.push(`(c.primary_genre = '${q.filters.genre}' OR c.genres_json LIKE '%${q.filters.genre}%')`);
  }
  if (q.filters?.country && q.filters.country !== "ANY") {
    whereClauses.push(`(c.primary_country = '${q.filters.country}' OR c.countries_json LIKE '%${q.filters.country}%')`);
  }

  const filterSql = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : "";

  if (ftsQuery) {
    // In SQLite FTS5, bare alphanumeric tokens separated by OR work identically to quoted tokens.
    // Clean all inner double quotes to prevent Windows/PowerShell argument splitting.
    const cleanFts = ftsQuery.replace(/"/g, "").replace(/'/g, "''");
    const escapedNorm = normalizedRaw.replace(/'/g, "''");
    const prefixCheck = `CASE WHEN c.normalized_title = '${escapedNorm}' THEN 100.0 WHEN length('${escapedNorm}') <= 30 AND substr(c.normalized_title, 1, length('${escapedNorm}')) = '${escapedNorm}' THEN 40.0 ELSE 0.0 END`;
    return `SELECT '${q.id}' as qid, c.item_id, c.id, c.title, c.release_year, c.primary_genre, c.primary_country, c.rating, ROUND((${prefixCheck}) + (-bm25(catalog_fts, 10.0, 5.0, 2.0, 1.0, 4.0) * 20.0) + (COALESCE(c.rating, 6.0) * 1.5) + (COALESCE(c.popularity_score, 0.0) * 0.05), 2) AS score FROM catalog_fts f JOIN catalog_items c ON f.rowid = c.item_id WHERE catalog_fts MATCH '${cleanFts}' ${filterSql} ORDER BY score DESC, c.rating DESC, c.item_id ASC LIMIT 5;`;
  } else {
    const fallbackWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : "";
    const escapedNorm = normalizedRaw.replace(/'/g, "''");
    const escapedTrim = trimmedQuery.replace(/'/g, "''");
    return `SELECT '${q.id}' as qid, c.item_id, c.id, c.title, c.release_year, c.primary_genre, c.primary_country, c.rating, 0.0 AS score FROM catalog_items c WHERE (c.normalized_title LIKE '%${escapedNorm}%' OR c.title LIKE '%${escapedTrim}%') ${fallbackWhere} ORDER BY c.rating DESC, c.id ASC LIMIT 5;`;
  }
}

// Generate in 8 batches of 5 queries
const batches: string[][] = [];
const batchSize = 5;
for (let i = 0; i < BENCHMARK_QUERIES.length; i += batchSize) {
  const slice = BENCHMARK_QUERIES.slice(i, i + batchSize);
  batches.push(slice.map(generateSqlForQuery));
}

const output = {
  totalQueries: BENCHMARK_QUERIES.length,
  batchCount: batches.length,
  batches: batches.map(b => b.join(" "))
};

writeFileSync("scripts/benchmark_sql_batches.json", JSON.stringify(output, null, 2), "utf8");
console.log(`Generated ${BENCHMARK_QUERIES.length} queries across ${batches.length} batches.`);
