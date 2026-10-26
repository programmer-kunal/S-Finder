-- Migration 0002: Synchronize FTS5 rowid with catalog_items.rowid and update triggers
-- Eliminates O(N) full-table scans on catalog_fts during updates and deletes.

-- 1. Drop existing unoptimized triggers
DROP TRIGGER IF EXISTS trg_catalog_ai;
DROP TRIGGER IF EXISTS trg_catalog_ad;
DROP TRIGGER IF EXISTS trg_catalog_au;

-- 2. Create rowid-synchronized triggers
CREATE TRIGGER trg_catalog_ai AFTER INSERT ON catalog_items BEGIN
    INSERT INTO catalog_fts(rowid, id, title, aliases, synopsis, genres, trope_tags)
    VALUES (
        new.rowid,
        new.id,
        new.title,
        COALESCE(new.original_title, ''),
        COALESCE(new.synopsis, ''),
        COALESCE(new.genres_json, ''),
        COALESCE(new.trope_tags, '')
    );
END;

CREATE TRIGGER trg_catalog_ad AFTER DELETE ON catalog_items BEGIN
    DELETE FROM catalog_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER trg_catalog_au AFTER UPDATE ON catalog_items BEGIN
    DELETE FROM catalog_fts WHERE rowid = old.rowid;
    INSERT INTO catalog_fts(rowid, id, title, aliases, synopsis, genres, trope_tags)
    VALUES (
        new.rowid,
        new.id,
        new.title,
        COALESCE(new.original_title, ''),
        COALESCE(new.synopsis, ''),
        COALESCE(new.genres_json, ''),
        COALESCE(new.trope_tags, '')
    );
END;

-- 3. Rebuild catalog_fts to restore 1:1 rowid alignment with catalog_items
DELETE FROM catalog_fts;
INSERT INTO catalog_fts(rowid, id, title, aliases, synopsis, genres, trope_tags)
SELECT
    rowid,
    id,
    title,
    COALESCE(original_title, ''),
    COALESCE(synopsis, ''),
    COALESCE(genres_json, ''),
    COALESCE(trope_tags, '')
FROM catalog_items;
