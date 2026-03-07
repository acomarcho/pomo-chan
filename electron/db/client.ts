import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "../../src/db/schema";
import { getSessionDbPath } from "./paths";

type SessionDatabase = BetterSQLite3Database<typeof schema>;

let sqlite: Database.Database | null = null;
let db: SessionDatabase | null = null;
let didApplyFreshStart = false;

const openSqlite = () => {
  if (sqlite) return sqlite;

  const dbPath = getSessionDbPath();

  if (!didApplyFreshStart) {
    didApplyFreshStart = true;

    if (process.env.FRESH_START === "1") {
      fs.rmSync(dbPath, { force: true });
      fs.rmSync(`${dbPath}-wal`, { force: true });
      fs.rmSync(`${dbPath}-shm`, { force: true });
    }
  }

  sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  return sqlite;
};

export const getSessionDatabase = (): SessionDatabase => {
  if (db) return db;

  db = drizzle(openSqlite(), { schema });
  return db;
};

export const closeSessionDatabase = () => {
  if (!sqlite) return;

  sqlite.close();
  sqlite = null;
  db = null;
};
