import * as SQLite from "expo-sqlite";
import type { OutboxRow } from "../domain/types";
let connection: Promise<SQLite.SQLiteDatabase> | undefined;
async function db() {
  connection ??= (async () => {
    const d = await SQLite.openDatabaseAsync("crewgrain-outbox.db");
    await d.execAsync(
      "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY NOT NULL, body TEXT NOT NULL);",
    );
    return d;
  })();
  return connection;
}
export async function putOutbox(row: OutboxRow) {
  const d = await db();
  await d.runAsync(
    "INSERT INTO outbox (id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
    row.id,
    JSON.stringify(row),
  );
}
export async function listOutbox(): Promise<OutboxRow[]> {
  const d = await db();
  return (
    await d.getAllAsync<{ body: string }>(
      "SELECT body FROM outbox ORDER BY rowid",
    )
  ).flatMap((r) => {
    try {
      return [JSON.parse(r.body) as OutboxRow];
    } catch {
      return [];
    }
  });
}
export async function removeOutbox(id: string) {
  const d = await db();
  await d.runAsync("DELETE FROM outbox WHERE id=?", id);
}
