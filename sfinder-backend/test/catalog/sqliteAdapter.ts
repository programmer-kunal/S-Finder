import { DatabaseSync } from "node:sqlite";
import { DatabaseAdapter, PreparedStatementAdapter } from "../../src/catalog/types";

export class NodeSqliteAdapter implements DatabaseAdapter {
  constructor(public rawDb: DatabaseSync) {}

  prepare(sql: string): PreparedStatementAdapter {
    return new NodeSqlitePreparedStatement(this.rawDb, sql);
  }

  async batch(statements: PreparedStatementAdapter[]): Promise<any[]> {
    this.rawDb.exec("BEGIN TRANSACTION;");
    try {
      const results: any[] = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      this.rawDb.exec("COMMIT;");
      return results;
    } catch (err) {
      this.rawDb.exec("ROLLBACK;");
      throw err;
    }
  }

  async exec(sql: string): Promise<any> {
    return this.rawDb.exec(sql);
  }
}

class NodeSqlitePreparedStatement implements PreparedStatementAdapter {
  private boundValues: any[] = [];

  constructor(
    private db: DatabaseSync,
    private sql: string
  ) {}

  bind(...values: any[]): PreparedStatementAdapter {
    this.boundValues = values.map(v => (v === undefined ? null : v));
    return this;
  }

  async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
    try {
      const stmt = this.db.prepare(this.sql);
      const rows = stmt.all(...this.boundValues) as T[];
      return { results: rows, success: true };
    } catch (err) {
      throw err;
    }
  }

  async first<T = any>(colName?: string): Promise<T | null> {
    try {
      const stmt = this.db.prepare(this.sql);
      const row = stmt.get(...this.boundValues) as any;
      if (!row) return null;
      if (colName) return row[colName] ?? null;
      return row as T;
    } catch (err) {
      throw err;
    }
  }

  async run(): Promise<{ success: boolean; meta?: any }> {
    try {
      const stmt = this.db.prepare(this.sql);
      const res = stmt.run(...this.boundValues);
      return { success: true, meta: res };
    } catch (err) {
      throw err;
    }
  }
}

export function createMemoryDatabase(): NodeSqliteAdapter {
  const db = new DatabaseSync(":memory:");
  return new NodeSqliteAdapter(db);
}
