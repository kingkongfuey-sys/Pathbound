// The phone's side of the record book: opens the SQLite database through the Capacitor plugin and presents it as a
// SqlDriver. This is the only file that knows the plugin exists. Notes from reading the plugin's Android source:
// every statement handed to `executeSet` must carry a `values` array (an empty one is fine), a failed statement
// rolls the whole set back, and `execute` runs plain statements, which is why schema work goes through `script`.
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { SqlDriver, SqlStatement, SqlValue } from './types.ts';

const DATABASE = 'pathbound';

// One wrapper for the life of the page: it remembers the connections it has made, which a retry after a failure needs.
const sqlite = new SQLiteConnection(CapacitorSQLite);

/** Close any open connection and delete the database file. Only for the "start a fresh book" recovery. */
export async function destroyCapacitorBook(): Promise<void> {
  try {
    if ((await sqlite.isConnection(DATABASE, false)).result === true) await sqlite.closeConnection(DATABASE, false);
  } catch {
    // A connection that won't close is not worth stopping for; the delete below is what matters.
  }
  if ((await CapacitorSQLite.isDatabase({ database: DATABASE })).result === true) {
    await CapacitorSQLite.deleteDatabase({ database: DATABASE, readonly: false });
  }
}

export async function openCapacitorDriver(): Promise<SqlDriver> {

  // After a webview reload the native side can still hold a connection the page has forgotten; reuse it rather than fail.
  const consistent = (await sqlite.checkConnectionsConsistency()).result === true;
  const existing = (await sqlite.isConnection(DATABASE, false)).result === true;
  const db: SQLiteDBConnection =
    consistent && existing ? await sqlite.retrieveConnection(DATABASE, false) : await sqlite.createConnection(DATABASE, false, 'no-encryption', 1, false);
  await db.open();

  return {
    async script(sql: string): Promise<void> {
      await db.execute(sql, true);
    },
    async batch(statements: SqlStatement[]): Promise<void> {
      if (statements.length === 0) return;
      await db.executeSet(
        statements.map((s) => ({ statement: s.sql, values: s.params ?? [] })),
        true,
      );
    },
    async rows(sql: string, params: SqlValue[] = []): Promise<Array<Record<string, SqlValue>>> {
      const result = await db.query(sql, params);
      const values: unknown[] = result.values ?? [];
      // iOS puts a column-name row first; Android does not. Dropping it keeps this honest on both.
      return values.filter((row): row is Record<string, SqlValue> => typeof row === 'object' && row !== null && !('ios_columns' in row));
    },
  };
}
