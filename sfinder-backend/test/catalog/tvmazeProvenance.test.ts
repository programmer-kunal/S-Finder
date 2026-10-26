import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CatalogIngestor } from "../../src/catalog/ingestor";

describe("TVMaze Pagination & Show ID Provenance", () => {
  it("correctly maps TVMaze show IDs to expected API page numbers", () => {
    // Page 0: [0, 249]
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(0), 0);
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(1), 0); // Under the Dome
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(249), 0);

    // Page 1: [250, 499]
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(250), 1);
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(499), 1);

    // Page 7: [1750, 1999] - contains Gargoyles (1898)
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(1750), 7);
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(1898), 7);
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(1999), 7);

    // Page 8: [2000, 2249]
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(2000), 8);
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(2249), 8);

    // Page 9: [2250, 2499]
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(2250), 9);
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(2499), 9);

    // Page 10: [2500, 2749] - contains Daria (2554)
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(2500), 10);
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(2554), 10);
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(2749), 10);

    // Page 16: [4000, 4249] - contains Frozen Planet (4000) and page ceiling (4249)
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(4000), 16);
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(4249), 16);

    // Page 17: [4250, 4499] - next un-ingested page
    assert.strictEqual(CatalogIngestor.getTvMazeExpectedPage(4250), 17);
  });

  it("calculates exact inclusive ID ranges for pages", () => {
    assert.deepStrictEqual(CatalogIngestor.getTvMazePageRange(0), { minId: 0, maxId: 249 });
    assert.deepStrictEqual(CatalogIngestor.getTvMazePageRange(7), { minId: 1750, maxId: 1999 });
    assert.deepStrictEqual(CatalogIngestor.getTvMazePageRange(9), { minId: 2250, maxId: 2499 });
    assert.deepStrictEqual(CatalogIngestor.getTvMazePageRange(10), { minId: 2500, maxId: 2749 });
    assert.deepStrictEqual(CatalogIngestor.getTvMazePageRange(16), { minId: 4000, maxId: 4249 });
  });

  it("validates boundary checks for specific historical milestone shows", () => {
    // Daria (2554) is on Page 10, not Page 9
    assert.strictEqual(CatalogIngestor.isTvMazeIdInPage(2554, 10), true);
    assert.strictEqual(CatalogIngestor.isTvMazeIdInPage(2554, 9), false);

    // Gargoyles (1898) is on Page 7, not Page 16
    assert.strictEqual(CatalogIngestor.isTvMazeIdInPage(1898, 7), true);
    assert.strictEqual(CatalogIngestor.isTvMazeIdInPage(1898, 16), false);

    // Frozen Planet (4000) is on Page 16
    assert.strictEqual(CatalogIngestor.isTvMazeIdInPage(4000, 16), true);
    assert.strictEqual(CatalogIngestor.isTvMazeIdInPage(4000, 15), false);
  });

  it("rejects negative IDs and pages", () => {
    assert.throws(() => CatalogIngestor.getTvMazeExpectedPage(-1));
    assert.throws(() => CatalogIngestor.getTvMazePageRange(-1));
    assert.strictEqual(CatalogIngestor.isTvMazeIdInPage(-5, 0), false);
    assert.strictEqual(CatalogIngestor.isTvMazeIdInPage(10, -1), false);
  });
});
