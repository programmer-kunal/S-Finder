import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const db = new DatabaseSync(":memory:");
const schema = fs.readFileSync(
  path.resolve(__dirname, "../../migrations/0001_catalog_schema.sql"),
  "utf8"
);
db.exec(schema);

// 1. Initial Insert via UPSERT
const upsertSql = `
  INSERT INTO catalog_items (
    id, provider, provider_id, media_type, title, original_title,
    normalized_title, release_year, genres_json, primary_genre,
    countries_json, primary_country, synopsis, rating, vote_count,
    popularity_score, poster_url, catalog_source, trope_tags,
    provider_updated_at, indexed_at
  ) VALUES (
    'tvmaze-100', 'TVMAZE', '100', 'SERIES', 'Initial Title', NULL,
    'initial title', 2021, '["Drama"]', 'Drama',
    '["US"]', 'US', 'Initial synopsis with AlphaKeyword', 7.5, 100,
    50, NULL, 'TVmaze', 'alpha trope',
    1000, 1000
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
    indexed_at = excluded.indexed_at;
`;

db.exec(upsertSql);

console.log("After 1st Insert:");
const q1 = db.prepare("SELECT c.id, c.title FROM catalog_fts f JOIN catalog_items c ON f.id = c.id WHERE catalog_fts MATCH 'AlphaKeyword';").all();
console.log("  Search 'AlphaKeyword':", q1);
const count1 = db.prepare("SELECT count(*) as count FROM catalog_fts;").get() as any;
console.log("  FTS count:", count1.count);

// 2. Re-import / Update same record with BetaKeyword instead of AlphaKeyword via UPSERT
const updateSql = `
  INSERT INTO catalog_items (
    id, provider, provider_id, media_type, title, original_title,
    normalized_title, release_year, genres_json, primary_genre,
    countries_json, primary_country, synopsis, rating, vote_count,
    popularity_score, poster_url, catalog_source, trope_tags,
    provider_updated_at, indexed_at
  ) VALUES (
    'tvmaze-100', 'TVMAZE', '100', 'SERIES', 'Updated Title', NULL,
    'updated title', 2021, '["Drama"]', 'Drama',
    '["US"]', 'US', 'Updated synopsis with BetaKeyword', 9.0, 200,
    80, NULL, 'TVmaze', 'beta trope',
    2000, 2000
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
    indexed_at = excluded.indexed_at;
`;

db.exec(updateSql);

console.log("\nAfter 2nd UPSERT (Update):");
const qOld = db.prepare("SELECT c.id, c.title FROM catalog_fts f JOIN catalog_items c ON f.id = c.id WHERE catalog_fts MATCH 'AlphaKeyword';").all();
console.log("  Search old 'AlphaKeyword':", qOld);

const qNew = db.prepare("SELECT c.id, c.title FROM catalog_fts f JOIN catalog_items c ON f.id = c.id WHERE catalog_fts MATCH 'BetaKeyword';").all();
console.log("  Search new 'BetaKeyword':", qNew);

const count2 = db.prepare("SELECT count(*) as count FROM catalog_fts;").get() as any;
console.log("  FTS count:", count2.count);
const itemCount = db.prepare("SELECT count(*) as count FROM catalog_items;").get() as any;
console.log("  catalog_items count:", itemCount.count);
