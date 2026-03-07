import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";

import { sessionAppUsage, sessions } from "../src/db/schema";
import type {
  SessionAppUsage,
  SessionDetail,
  SessionEntry,
  SessionList,
  SessionRecord,
  SessionFocusSummary
} from "../src/lib/session-types";
import { closeSessionDatabase, getSessionDatabase } from "./db/client";

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

const createDateRangeFilter = (
  dateRange?: { startDate?: string; endDate?: string },
  column: typeof sessions.startedAt = sessions.startedAt
): SQL<unknown> | undefined => {
  const conditions: SQL<unknown>[] = [];

  if (dateRange?.startDate) {
    conditions.push(gte(column, dateRange.startDate));
  }

  if (dateRange?.endDate) {
    conditions.push(lte(column, dateRange.endDate));
  }

  if (conditions.length === 0) {
    return undefined;
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions);
};

const getFocusSecondsBetween = (startIso: string, endIso: string) => {
  const database = getSessionDatabase();
  const row = database
    .select({
      total: sql<number>`
        coalesce(
          sum(
            coalesce(
              ${sessions.focusSeconds},
              cast(strftime('%s', ${sessions.endedAt}) as integer) -
              cast(strftime('%s', ${sessions.startedAt}) as integer)
            )
          ),
          0
        )
      `
    })
    .from(sessions)
    .where(and(gte(sessions.startedAt, startIso), lte(sessions.startedAt, endIso)))
    .get();

  return Math.max(0, Number(row?.total ?? 0));
};

const insertSessionGraph = (record: SessionRecord) => {
  const database = getSessionDatabase();
  const focusSeconds = record.focusSeconds ?? (record.appUsage ? calculateFocusSeconds(record.appUsage) : null);

  return database.transaction((tx) => {
    const inserted = tx
      .insert(sessions)
      .values({
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        focusSeconds
      })
      .returning({ id: sessions.id })
      .get();

    const sessionId = Number(inserted.id);

    if (record.appUsage && record.appUsage.length > 0) {
      tx.insert(sessionAppUsage)
        .values(
          record.appUsage.map((segment) => ({
            sessionId,
            appName: segment.appName,
            windowTitle: segment.windowTitle ?? null,
            startedAt: segment.startedAt,
            endedAt: segment.endedAt
          }))
        )
        .run();
    }

    return sessionId;
  });
};

export const addSession = (record: SessionRecord) => {
  return insertSessionGraph(record);
};

export const listSessions = (
  page: number,
  pageSize: number,
  dateRange?: { startDate?: string; endDate?: string }
): SessionList => {
  const database = getSessionDatabase();
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 10;
  const offset = (safePage - 1) * safePageSize;
  const dateFilter = createDateRangeFilter(dateRange);

  const rows = (
    dateFilter
      ? database
          .select({
            id: sessions.id,
            startedAt: sessions.startedAt,
            endedAt: sessions.endedAt,
            focusSeconds: sessions.focusSeconds,
            hasUsage: sql<number>`cast(exists(select 1 from ${sessionAppUsage} where ${sessionAppUsage.sessionId} = ${sessions.id} limit 1) as integer)`
          })
          .from(sessions)
          .where(dateFilter)
          .orderBy(desc(sessions.startedAt))
          .limit(safePageSize)
          .offset(offset)
      : database
          .select({
            id: sessions.id,
            startedAt: sessions.startedAt,
            endedAt: sessions.endedAt,
            focusSeconds: sessions.focusSeconds,
            hasUsage: sql<number>`cast(exists(select 1 from ${sessionAppUsage} where ${sessionAppUsage.sessionId} = ${sessions.id} limit 1) as integer)`
          })
          .from(sessions)
          .orderBy(desc(sessions.startedAt))
          .limit(safePageSize)
          .offset(offset)
  ).all();

  const totalRow = (
    dateFilter
      ? database
          .select({ count: sql<number>`cast(count(*) as integer)` })
          .from(sessions)
          .where(dateFilter)
      : database.select({ count: sql<number>`cast(count(*) as integer)` }).from(sessions)
  ).get();

  const items: SessionEntry[] = rows.map((row) => ({
    id: row.id,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    focusSeconds: typeof row.focusSeconds === "number" ? row.focusSeconds : null,
    hasUsage: Boolean(row.hasUsage)
  }));

  return {
    items,
    total: Number(totalRow?.count ?? 0)
  };
};

export const listAllSessions = (): SessionRecord[] => {
  const database = getSessionDatabase();
  const sessionRows = database.select().from(sessions).orderBy(asc(sessions.startedAt)).all();
  const usageRows = database.select().from(sessionAppUsage).orderBy(asc(sessionAppUsage.startedAt)).all();
  const usageBySession = new Map<number, SessionAppUsage[]>();

  for (const row of usageRows) {
    const list = usageBySession.get(row.sessionId);
    const segment = {
      appName: row.appName,
      windowTitle: row.windowTitle,
      startedAt: row.startedAt,
      endedAt: row.endedAt
    } satisfies SessionAppUsage;

    if (list) {
      list.push(segment);
    } else {
      usageBySession.set(row.sessionId, [segment]);
    }
  }

  return sessionRows.map((session) => ({
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    focusSeconds: session.focusSeconds ?? null,
    appUsage: usageBySession.get(session.id) ?? []
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
  const database = getSessionDatabase();

  database.transaction((tx) => {
    tx.delete(sessionAppUsage).run();
    tx.delete(sessions).run();
    tx.run(sql`DELETE FROM sqlite_sequence WHERE name IN ('sessions', 'session_app_usage')`);

    for (const record of entries) {
      const focusSeconds = record.focusSeconds ?? (record.appUsage ? calculateFocusSeconds(record.appUsage) : null);
      const inserted = tx
        .insert(sessions)
        .values({
          startedAt: record.startedAt,
          endedAt: record.endedAt,
          focusSeconds
        })
        .returning({ id: sessions.id })
        .get();

      const sessionId = Number(inserted.id);

      if (record.appUsage && record.appUsage.length > 0) {
        tx.insert(sessionAppUsage)
          .values(
            record.appUsage.map((segment) => ({
              sessionId,
              appName: segment.appName,
              windowTitle: segment.windowTitle ?? null,
              startedAt: segment.startedAt,
              endedAt: segment.endedAt
            }))
          )
          .run();
      }
    }
  });
};

export const clearSessions = () => {
  const database = getSessionDatabase();
  const totalRow = database
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(sessions)
    .get();

  database.transaction((tx) => {
    tx.delete(sessionAppUsage).run();
    tx.delete(sessions).run();
    tx.run(sql`DELETE FROM sqlite_sequence WHERE name IN ('sessions', 'session_app_usage')`);
  });

  return Number(totalRow?.count ?? 0);
};

export const mergeSessions = (entries: SessionRecord[]) => {
  const existingKeys = new Set(listAllSessions().map((record) => createSessionKey(record)));
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
  const database = getSessionDatabase();

  database.transaction((tx) => {
    for (const record of sortedEntries) {
      const focusSeconds = record.focusSeconds ?? (record.appUsage ? calculateFocusSeconds(record.appUsage) : null);
      const inserted = tx
        .insert(sessions)
        .values({
          startedAt: record.startedAt,
          endedAt: record.endedAt,
          focusSeconds
        })
        .returning({ id: sessions.id })
        .get();

      const sessionId = Number(inserted.id);

      if (record.appUsage && record.appUsage.length > 0) {
        tx.insert(sessionAppUsage)
          .values(
            record.appUsage.map((segment) => ({
              sessionId,
              appName: segment.appName,
              windowTitle: segment.windowTitle ?? null,
              startedAt: segment.startedAt,
              endedAt: segment.endedAt
            }))
          )
          .run();
      }
    }
  });

  return sortedEntries.length;
};

export const deleteSession = (id: number) => {
  const database = getSessionDatabase();
  database.delete(sessions).where(eq(sessions.id, id)).run();
};

export const getSessionDetail = (sessionId: number): SessionDetail | null => {
  const database = getSessionDatabase();
  const session = database.select().from(sessions).where(eq(sessions.id, sessionId)).get();

  if (!session) return null;

  const usage = database
    .select({
      appName: sessionAppUsage.appName,
      windowTitle: sessionAppUsage.windowTitle,
      startedAt: sessionAppUsage.startedAt,
      endedAt: sessionAppUsage.endedAt
    })
    .from(sessionAppUsage)
    .where(eq(sessionAppUsage.sessionId, sessionId))
    .orderBy(asc(sessionAppUsage.startedAt))
    .all();

  return {
    id: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    focusSeconds: session.focusSeconds ?? null,
    appUsage: usage
  };
};

export const getSessionFocusSummary = (): SessionFocusSummary => {
  const now = new Date();
  const endIso = now.toISOString();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  const startOfMonth = new Date(startOfToday);
  startOfMonth.setDate(startOfMonth.getDate() - 29);

  return {
    todaySeconds: getFocusSecondsBetween(startOfToday.toISOString(), endIso),
    weekSeconds: getFocusSecondsBetween(startOfWeek.toISOString(), endIso),
    monthSeconds: getFocusSecondsBetween(startOfMonth.toISOString(), endIso)
  };
};

export const closeSessionStore = () => {
  closeSessionDatabase();
};
