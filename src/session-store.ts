import Database from "better-sqlite3";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export type SessionEntry = {
  id: number;
  startedAt: string;
  endedAt: string;
};

export type SessionList = {
  items: SessionEntry[];
  total: number;
};

let db: Database | null = null;
let didApplyFreshStart = false;

const ensureDb = () => {
  if (db) return db;
  const dbPath = path.join(app.getPath("userData"), "pomo-chan.sqlite");
  if (!didApplyFreshStart) {
    didApplyFreshStart = true;
    if (process.env.FRESH_START === "1") {
      fs.rmSync(dbPath, { force: true });
      fs.rmSync(`${dbPath}-wal`, { force: true });
      fs.rmSync(`${dbPath}-shm`, { force: true });
    }
  }
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL
    );
  `);
  return db;
};

export const addSession = (startedAt: string, endedAt: string) => {
  const database = ensureDb();
  const stmt = database.prepare(
    "INSERT INTO sessions (started_at, ended_at) VALUES (?, ?)",
  );
  const info = stmt.run(startedAt, endedAt);
  return Number(info.lastInsertRowid);
};

export const listSessions = (page: number, pageSize: number): SessionList => {
  const database = ensureDb();
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 10;
  const offset = (safePage - 1) * safePageSize;
  const items = database
    .prepare(
      "SELECT id, started_at AS startedAt, ended_at AS endedAt FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?",
    )
    .all(safePageSize, offset) as SessionEntry[];
  const totalRow = database
    .prepare("SELECT COUNT(*) AS count FROM sessions")
    .get() as { count: number };
  return { items, total: Number(totalRow.count) };
};

export const closeSessionStore = () => {
  if (!db) return;
  db.close();
  db = null;
};
