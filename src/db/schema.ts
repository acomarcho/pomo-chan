import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at").notNull(),
  focusSeconds: integer("focus_seconds")
});

export const sessionAppUsage = sqliteTable(
  "session_app_usage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    appName: text("app_name").notNull(),
    windowTitle: text("window_title"),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at").notNull()
  },
  (table) => [index("session_app_usage_session_id").on(table.sessionId)]
);
