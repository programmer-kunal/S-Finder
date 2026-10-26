-- Step 1: Insert clearly marked temporary test record
INSERT INTO catalog_items (
    id, provider, provider_id, media_type, title, normalized_title, synopsis, genres_json, countries_json, catalog_source, trope_tags, indexed_at
) VALUES (
    'temp-phase5ar-test-1', 'TVMAZE', 'temp-test-1', 'SERIES', 'Temporary Quantum Secret', 'temporary quantum secret', 'A cryptographer investigates an ancient locked cipher.', '["Drama", "Sci-Fi"]', '["United Kingdom"]', 'Temporary Phase 5AR Test', 'cryptography hacker cipher', 1700000000000
);

-- Step 2: Search for initial keyword via FTS
SELECT 'STEP_2_SEARCH' as step, c.id, c.title
FROM catalog_fts f
JOIN catalog_items c ON f.id = c.id
WHERE catalog_fts MATCH 'cipher';

-- Step 3: Update title, synopsis, and tropes (firing trg_catalog_au)
UPDATE catalog_items
SET title = 'Temporary Quantum Vault Heist',
    normalized_title = 'temporary quantum vault heist',
    synopsis = 'An elite crew of thieves infiltrates an underground vault.',
    trope_tags = 'heist vault crew'
WHERE id = 'temp-phase5ar-test-1';

-- Step 4: Verify stale keyword returns 0 rows
SELECT 'STEP_4_STALE_CHECK' as step, count(*) as count
FROM catalog_fts f
JOIN catalog_items c ON f.id = c.id
WHERE catalog_fts MATCH 'cipher';

-- Step 5: Verify new keyword matches
SELECT 'STEP_5_NEW_CHECK' as step, c.id, c.title
FROM catalog_fts f
JOIN catalog_items c ON f.id = c.id
WHERE catalog_fts MATCH 'vault';

-- Step 6: Test BM25 composite ranking on remote database
SELECT 'STEP_6_RANKING' as step, c.id, c.title,
    (-bm25(catalog_fts, 10.0, 5.0, 2.0, 1.0, 4.0) * 20.0) as text_relevance
FROM catalog_fts f
JOIN catalog_items c ON f.id = c.id
WHERE catalog_fts MATCH 'vault OR thieves';

-- Step 7: Clean up temporary test record (firing trg_catalog_ad)
DELETE FROM catalog_items WHERE id = 'temp-phase5ar-test-1';

-- Step 8: Verify complete deletion from catalog_items and catalog_fts
SELECT 'STEP_8_CLEANUP_CHECK' as step,
    (SELECT count(*) FROM catalog_items WHERE id = 'temp-phase5ar-test-1') as items_count,
    (SELECT count(*) FROM catalog_fts WHERE id = 'temp-phase5ar-test-1') as fts_count;
