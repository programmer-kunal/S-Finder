import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE items (
    id TEXT PRIMARY KEY,
    title TEXT,
    synopsis TEXT
  );

  CREATE VIRTUAL TABLE fts_unindexed USING fts5(
    id UNINDEXED,
    title,
    synopsis
  );

  CREATE VIRTUAL TABLE fts_rowid USING fts5(
    title,
    synopsis
  );
`);

for (let i = 1; i <= 500; i++) {
  db.exec(`INSERT INTO items (id, title, synopsis) VALUES ('item-${i}', 'Title ${i}', 'Synopsis ${i}');`);
  db.exec(`INSERT INTO fts_unindexed (id, title, synopsis) VALUES ('item-${i}', 'Title ${i}', 'Synopsis ${i}');`);
  db.exec(`INSERT INTO fts_rowid (rowid, title, synopsis) VALUES (${i}, 'Title ${i}', 'Synopsis ${i}');`);
}

// Explain DELETE by UNINDEXED column:
const planUnindexed = db.prepare("EXPLAIN QUERY PLAN DELETE FROM fts_unindexed WHERE id = 'item-100';").all() as any[];
console.log("Plan for DELETE WHERE id = ...:", planUnindexed);

// Explain DELETE by rowid:
const planRowid = db.prepare("EXPLAIN QUERY PLAN DELETE FROM fts_rowid WHERE rowid = 100;").all() as any[];
console.log("Plan for DELETE WHERE rowid = ...:", planRowid);
