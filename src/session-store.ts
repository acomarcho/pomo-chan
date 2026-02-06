import Database from "better-sqlite3";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type {
  SessionAppUsage,
  SessionDetail,
  SessionEntry,
  SessionList,
  SessionRecord,
  SessionFocusSummary,
} from "./lib/session-types";

let db: Database.Database | null = null;
let didApplyFreshStart = false;

const ensureFocusSecondsColumn = (database: Database.Database) => {
  const columns = database
    .prepare("PRAGMA table_info(sessions)")
    .all() as Array<{ name: string }>;
  const hasFocusSeconds = columns.some(
    (column) => column.name === "focus_seconds",
  );
  if (!hasFocusSeconds) {
    database.exec("ALTER TABLE sessions ADD COLUMN focus_seconds INTEGER");
  }
};

const calculateFocusSeconds = (segments: SessionAppUsage[]) => {
  return segments.reduce((total, segment) => {
    const start = Date.parse(segment.startedAt);
    const end = Date.parse(segment.endedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return total;
    }
    const seconds = Math.round((end - start) / 1000);
    return total + Math.max(0, seconds);
  }, 0);
};

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
      ended_at TEXT NOT NULL,
      focus_seconds INTEGER
    );
  `);
  ensureFocusSecondsColumn(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_app_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      app_name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);
  db.exec(
    "CREATE INDEX IF NOT EXISTS session_app_usage_session_id ON session_app_usage(session_id)",
  );
  return db;
};

const getFocusSecondsBetween = (
  database: Database.Database,
  startIso: string,
  endIso: string,
) => {
  const row = database
    .prepare(
      `
      SELECT
        COALESCE(
          SUM(
            COALESCE(
              focus_seconds,
              CAST(strftime('%s', ended_at) AS INTEGER) -
              CAST(strftime('%s', started_at) AS INTEGER)
            )
          ),
          0
        ) AS total
      FROM sessions
      WHERE started_at >= ? AND started_at <= ?
      `,
    )
    .get(startIso, endIso) as { total: number } | undefined;
  const total = Number(row?.total ?? 0);
  return Math.max(0, total);
};

export const addSession = (record: SessionRecord) => {
  const database = ensureDb();
  const focusSeconds =
    record.focusSeconds ??
    (record.appUsage ? calculateFocusSeconds(record.appUsage) : null);
  const insertSession = database.prepare(
    "INSERT INTO sessions (started_at, ended_at, focus_seconds) VALUES (?, ?, ?)",
  );
  const info = insertSession.run(
    record.startedAt,
    record.endedAt,
    focusSeconds,
  );
  const sessionId = Number(info.lastInsertRowid);
  if (record.appUsage && record.appUsage.length > 0) {
    const insertUsage = database.prepare(
      "INSERT INTO session_app_usage (session_id, app_name, started_at, ended_at) VALUES (?, ?, ?, ?)",
    );
    const insertMany = database.transaction((segments: SessionAppUsage[]) => {
      for (const segment of segments) {
        insertUsage.run(
          sessionId,
          segment.appName,
          segment.startedAt,
          segment.endedAt,
        );
      }
    });
    insertMany(record.appUsage);
  }
  return sessionId;
};

export const listSessions = (page: number, pageSize: number): SessionList => {
  const database = ensureDb();
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 10;
  const offset = (safePage - 1) * safePageSize;
  const rows = database
    .prepare(
      `
      SELECT
        sessions.id AS id,
        sessions.started_at AS startedAt,
        sessions.ended_at AS endedAt,
        sessions.focus_seconds AS focusSeconds,
        EXISTS (
          SELECT 1 FROM session_app_usage
          WHERE session_app_usage.session_id = sessions.id
          LIMIT 1
        ) AS hasUsage
      FROM sessions
      ORDER BY sessions.started_at DESC
      LIMIT ? OFFSET ?
      `,
    )
    .all(safePageSize, offset) as Array<{
    id: number;
    startedAt: string;
    endedAt: string;
    focusSeconds: number | null;
    hasUsage: number;
  }>;
  const items = rows.map((row) => ({
    id: row.id,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    focusSeconds:
      typeof row.focusSeconds === "number" ? row.focusSeconds : null,
    hasUsage: Boolean(row.hasUsage),
  })) as SessionEntry[];
  const totalRow = database
    .prepare("SELECT COUNT(*) AS count FROM sessions")
    .get() as { count: number };
  return { items, total: Number(totalRow.count) };
};

export const listAllSessions = (): SessionRecord[] => {
  const database = ensureDb();
  const sessions = database
    .prepare(
      "SELECT id, started_at AS startedAt, ended_at AS endedAt, focus_seconds AS focusSeconds FROM sessions ORDER BY started_at ASC",
    )
    .all() as Array<{
    id: number;
    startedAt: string;
    endedAt: string;
    focusSeconds: number | null;
  }>;
  const usageRows = database
    .prepare(
      "SELECT session_id AS sessionId, app_name AS appName, started_at AS startedAt, ended_at AS endedAt FROM session_app_usage ORDER BY started_at ASC",
    )
    .all() as Array<{
    sessionId: number;
    appName: string;
    startedAt: string;
    endedAt: string;
  }>;
  const usageBySession = new Map<number, SessionAppUsage[]>();
  for (const row of usageRows) {
    const list = usageBySession.get(row.sessionId);
    const segment = {
      appName: row.appName,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
    };
    if (list) {
      list.push(segment);
    } else {
      usageBySession.set(row.sessionId, [segment]);
    }
  }
  return sessions.map((session) => ({
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    focusSeconds: session.focusSeconds ?? null,
    appUsage: usageBySession.get(session.id) ?? [],
  }));
};

const createSessionKey = (record: SessionRecord) => {
  return `${record.startedAt}::${record.endedAt}`;
};

const sortByStartedAt = (records: SessionRecord[]) => {
  return records.slice().sort((a, b) => {
    const aTime = Date.parse(a.startedAt);
    const bTime = Date.parse(b.startedAt);
    if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) {
      return a.startedAt.localeCompare(b.startedAt);
    }
    return aTime - bTime;
  });
};

export const replaceSessions = (entries: SessionRecord[]) => {
  const database = ensureDb();
  const insertSession = database.prepare(
    "INSERT INTO sessions (started_at, ended_at, focus_seconds) VALUES (?, ?, ?)",
  );
  const insertUsage = database.prepare(
    "INSERT INTO session_app_usage (session_id, app_name, started_at, ended_at) VALUES (?, ?, ?, ?)",
  );
  const replace = database.transaction((records: SessionRecord[]) => {
    database.exec("DELETE FROM session_app_usage");
    database.exec("DELETE FROM sessions");
    database.exec("DELETE FROM sqlite_sequence WHERE name = 'sessions'");
    database.exec(
      "DELETE FROM sqlite_sequence WHERE name = 'session_app_usage'",
    );
    for (const record of records) {
      const focusSeconds =
        record.focusSeconds ??
        (record.appUsage ? calculateFocusSeconds(record.appUsage) : null);
      const info = insertSession.run(
        record.startedAt,
        record.endedAt,
        focusSeconds,
      );
      const sessionId = Number(info.lastInsertRowid);
      if (record.appUsage && record.appUsage.length > 0) {
        for (const segment of record.appUsage) {
          insertUsage.run(
            sessionId,
            segment.appName,
            segment.startedAt,
            segment.endedAt,
          );
        }
      }
    }
  });
  replace(entries);
};

export const mergeSessions = (entries: SessionRecord[]) => {
  const database = ensureDb();
  const existingKeys = new Set(
    listAllSessions().map((record) => createSessionKey(record)),
  );
  const uniqueEntries = entries.filter((record) => {
    const key = createSessionKey(record);
    if (existingKeys.has(key)) {
      return false;
    }
    existingKeys.add(key);
    return true;
  });
  if (uniqueEntries.length === 0) {
    return 0;
  }
  const sortedEntries = sortByStartedAt(uniqueEntries);
  const insertSession = database.prepare(
    "INSERT INTO sessions (started_at, ended_at, focus_seconds) VALUES (?, ?, ?)",
  );
  const insertUsage = database.prepare(
    "INSERT INTO session_app_usage (session_id, app_name, started_at, ended_at) VALUES (?, ?, ?, ?)",
  );
  const insertMany = database.transaction((records: SessionRecord[]) => {
    for (const record of records) {
      const focusSeconds =
        record.focusSeconds ??
        (record.appUsage ? calculateFocusSeconds(record.appUsage) : null);
      const info = insertSession.run(
        record.startedAt,
        record.endedAt,
        focusSeconds,
      );
      const sessionId = Number(info.lastInsertRowid);
      if (record.appUsage && record.appUsage.length > 0) {
        for (const segment of record.appUsage) {
          insertUsage.run(
            sessionId,
            segment.appName,
            segment.startedAt,
            segment.endedAt,
          );
        }
      }
    }
  });
  insertMany(sortedEntries);
  return sortedEntries.length;
};

export const getSessionDetail = (sessionId: number): SessionDetail | null => {
  const database = ensureDb();
  const session = database
    .prepare(
      "SELECT id, started_at AS startedAt, ended_at AS endedAt, focus_seconds AS focusSeconds FROM sessions WHERE id = ?",
    )
    .get(sessionId) as
    | {
        id: number;
        startedAt: string;
        endedAt: string;
        focusSeconds: number | null;
      }
    | undefined;
  if (!session) return null;
  const usage = database
    .prepare(
      "SELECT app_name AS appName, started_at AS startedAt, ended_at AS endedAt FROM session_app_usage WHERE session_id = ? ORDER BY started_at ASC",
    )
    .all(sessionId) as SessionAppUsage[];
  return {
    id: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    focusSeconds: session.focusSeconds ?? null,
    appUsage: usage,
  };
};

export const getSessionFocusSummary = (): SessionFocusSummary => {
  const database = ensureDb();
  const now = new Date();
  const endIso = now.toISOString();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  const startOfMonth = new Date(startOfToday);
  startOfMonth.setDate(startOfMonth.getDate() - 29);

  return {
    todaySeconds: getFocusSecondsBetween(
      database,
      startOfToday.toISOString(),
      endIso,
    ),
    weekSeconds: getFocusSecondsBetween(
      database,
      startOfWeek.toISOString(),
      endIso,
    ),
    monthSeconds: getFocusSecondsBetween(
      database,
      startOfMonth.toISOString(),
      endIso,
    ),
  };
};

export const closeSessionStore = () => {
  if (!db) return;
  db.close();
  db = null;
};
