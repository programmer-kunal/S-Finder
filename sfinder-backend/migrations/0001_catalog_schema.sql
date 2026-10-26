-- S Finder Catalog Database Schema
-- Migration 0001: Normalized Catalog Items, SQLite FTS5 Index, and Ingestion Cursor

-- 1. Main Catalog Table
CREATE TABLE IF NOT EXISTS catalog_items (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT, -- Explicit permanent integer identity (stable rowid)
    id TEXT NOT NULL UNIQUE,                   -- Provider catalog ID (e.g. 'tvmaze-1', 'wikidata-Q25188')
    provider TEXT NOT NULL,                    -- 'TVMAZE' | 'WIKIDATA'
    provider_id TEXT NOT NULL,                 -- e.g. '1', 'Q25188'
    media_type TEXT NOT NULL,                  -- 'SERIES' | 'MOVIE'
    title TEXT NOT NULL,                       -- Canonical title
    original_title TEXT,                       -- Original or native script title
    normalized_title TEXT NOT NULL,            -- Lowercase, stripped punctuation for exact/prefix lookups
    release_year INTEGER,                      -- Verified year, nullable
    genres_json TEXT NOT NULL DEFAULT '[]',    -- JSON array of verified genres: ["Drama", "Action"]
    primary_genre TEXT,                        -- Extracted first genre for fast B-tree index
    countries_json TEXT NOT NULL DEFAULT '[]', -- JSON array of verified countries: ["United Kingdom", "United States"]
    primary_country TEXT,                      -- Extracted first country name for fast B-tree index
    synopsis TEXT,                             -- Genuine source summary (HTML stripped)
    rating REAL,                               -- Verified rating (e.g. 8.5)
    vote_count INTEGER,                        -- Verified vote count where supplied
    popularity_score REAL,                     -- Verified weight / popularity score where available
    poster_url TEXT,                           -- Source image URL where permitted
    catalog_source TEXT NOT NULL,              -- Attribution statement: 'Data provided by TVmaze (CC BY-SA 4.0)' or 'Data provided by Wikidata (CC0)'
    trope_tags TEXT,                           -- Narrative concepts & trope synonyms for semantic search
    provider_updated_at INTEGER,               -- Upstream provider modification timestamp ms
    indexed_at INTEGER NOT NULL                -- Timestamp ms when imported to S Finder
);

-- 2. Indexes for Fast B-Tree Filter Lookups (avoiding full-table scans)
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_provider_id ON catalog_items(provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_catalog_media_type ON catalog_items(media_type);
CREATE INDEX IF NOT EXISTS idx_catalog_normalized_title ON catalog_items(normalized_title);
CREATE INDEX IF NOT EXISTS idx_catalog_year ON catalog_items(release_year);
CREATE INDEX IF NOT EXISTS idx_catalog_rating ON catalog_items(rating DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_primary_genre ON catalog_items(primary_genre);
CREATE INDEX IF NOT EXISTS idx_catalog_primary_country ON catalog_items(primary_country);

-- 3. Resumable Ingestion Cursor Table
CREATE TABLE IF NOT EXISTS import_cursor (
    provider TEXT PRIMARY KEY,                 -- 'TVMAZE' | 'WIKIDATA'
    last_page INTEGER NOT NULL DEFAULT 0,      -- TVmaze pagination page index or offset cursor
    total_imported INTEGER NOT NULL DEFAULT 0, -- Count of records imported
    last_imported_id TEXT,                     -- Last processed provider ID
    status TEXT NOT NULL DEFAULT 'IDLE',       -- 'IDLE' | 'IN_PROGRESS' | 'COMPLETED' | 'ERROR'
    error_message TEXT,                        -- Last error message if any
    updated_at INTEGER NOT NULL                -- Timestamp of last checkpoint
);

-- 3b. Daily Ingestion Guardrails & Row-Write Budget Tracker
CREATE TABLE IF NOT EXISTS ingestion_budget_tracker (
    day_utc TEXT PRIMARY KEY,                  -- YYYY-MM-DD UTC date
    rows_written INTEGER NOT NULL DEFAULT 0,   -- Total rows written by importer on this UTC day
    rows_read INTEGER NOT NULL DEFAULT 0,      -- Total rows read by importer on this UTC day
    records_imported INTEGER NOT NULL DEFAULT 0,-- Total items imported on this UTC day
    batches_processed INTEGER NOT NULL DEFAULT 0,-- Total batch operations executed
    updated_at INTEGER NOT NULL                -- Timestamp of last tracking update
);

-- 4. SQLite FTS5 Virtual Table for Broad Context Retrieval
CREATE VIRTUAL TABLE IF NOT EXISTS catalog_fts USING fts5(
    id UNINDEXED,
    title,
    aliases,
    synopsis,
    genres,
    trope_tags,
    tokenize = 'porter unicode61'
);

-- 5. Automatic Synchronization Triggers between catalog_items and catalog_fts (Explicit item_id)
CREATE TRIGGER IF NOT EXISTS trg_catalog_ai AFTER INSERT ON catalog_items BEGIN
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

CREATE TRIGGER IF NOT EXISTS trg_catalog_ad AFTER DELETE ON catalog_items BEGIN
    DELETE FROM catalog_fts WHERE rowid = old.item_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_catalog_au AFTER UPDATE ON catalog_items BEGIN
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
