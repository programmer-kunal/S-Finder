-- Migration 0003: Explicit INTEGER PRIMARY KEY AUTOINCREMENT for catalog_items
-- Establishes permanent, persistent integer row identity (item_id) for catalog records.
-- Preserves existing text 'id' (e.g. 'tvmaze-1') with UNIQUE constraint and ON CONFLICT(id).

-- 1. Create table with explicit INTEGER PRIMARY KEY AUTOINCREMENT
CREATE TABLE IF NOT EXISTS new_catalog_items (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    media_type TEXT NOT NULL,
    title TEXT NOT NULL,
    original_title TEXT,
    normalized_title TEXT NOT NULL,
    release_year INTEGER,
    genres_json TEXT NOT NULL DEFAULT '[]',
    primary_genre TEXT,
    countries_json TEXT NOT NULL DEFAULT '[]',
    primary_country TEXT,
    synopsis TEXT,
    rating REAL,
    vote_count INTEGER,
    popularity_score REAL,
    poster_url TEXT,
    catalog_source TEXT NOT NULL,
    trope_tags TEXT,
    provider_updated_at INTEGER,
    indexed_at INTEGER NOT NULL
);

-- 2. Migrate existing records preserving their exact rowid as item_id
INSERT INTO new_catalog_items (
    item_id, id, provider, provider_id, media_type, title, original_title,
    normalized_title, release_year, genres_json, primary_genre,
    countries_json, primary_country, synopsis, rating, vote_count,
    popularity_score, poster_url, catalog_source, trope_tags,
    provider_updated_at, indexed_at
)
SELECT
    rowid, id, provider, provider_id, media_type, title, original_title,
    normalized_title, release_year, genres_json, primary_genre,
    countries_json, primary_country, synopsis, rating, vote_count,
    popularity_score, poster_url, catalog_source, trope_tags,
    provider_updated_at, indexed_at
FROM catalog_items
ORDER BY rowid ASC;

-- 3. Drop legacy triggers and original table
DROP TRIGGER IF EXISTS trg_catalog_ai;
DROP TRIGGER IF EXISTS trg_catalog_ad;
DROP TRIGGER IF EXISTS trg_catalog_au;
DROP TABLE catalog_items;

-- 4. Rename new table to catalog_items
ALTER TABLE new_catalog_items RENAME TO catalog_items;

-- 5. Re-create secondary B-tree indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_provider_id ON catalog_items(provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_catalog_media_type ON catalog_items(media_type);
CREATE INDEX IF NOT EXISTS idx_catalog_normalized_title ON catalog_items(normalized_title);
CREATE INDEX IF NOT EXISTS idx_catalog_year ON catalog_items(release_year);
CREATE INDEX IF NOT EXISTS idx_catalog_rating ON catalog_items(rating DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_primary_genre ON catalog_items(primary_genre);
CREATE INDEX IF NOT EXISTS idx_catalog_primary_country ON catalog_items(primary_country);

-- 6. Create rowid-synchronized triggers using explicit item_id
CREATE TRIGGER trg_catalog_ai AFTER INSERT ON catalog_items BEGIN
    INSERT INTO catalog_fts(rowid, id, title, aliases, synopsis, genres, trope_tags)
    VALUES (
        new.item_id,
        new.id,
        new.title,
        COALESCE(new.original_title, ''),
        COALESCE(new.synopsis, ''),
        COALESCE(new.genres_json, ''),
        COALESCE(new.trope_tags, '')
    );
END;

CREATE TRIGGER trg_catalog_ad AFTER DELETE ON catalog_items BEGIN
    DELETE FROM catalog_fts WHERE rowid = old.item_id;
END;

CREATE TRIGGER trg_catalog_au AFTER UPDATE ON catalog_items BEGIN
    DELETE FROM catalog_fts WHERE rowid = old.item_id;
    INSERT INTO catalog_fts(rowid, id, title, aliases, synopsis, genres, trope_tags)
    VALUES (
        new.item_id,
        new.id,
        new.title,
        COALESCE(new.original_title, ''),
        COALESCE(new.synopsis, ''),
        COALESCE(new.genres_json, ''),
        COALESCE(new.trope_tags, '')
    );
END;

-- 7. Re-sync catalog_fts entries with item_id
DELETE FROM catalog_fts;
INSERT INTO catalog_fts(rowid, id, title, aliases, synopsis, genres, trope_tags)
SELECT
    item_id,
    id,
    title,
    COALESCE(original_title, ''),
    COALESCE(synopsis, ''),
    COALESCE(genres_json, ''),
    COALESCE(trope_tags, '')
FROM catalog_items
ORDER BY item_id ASC;
