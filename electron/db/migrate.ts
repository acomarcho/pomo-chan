import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { getSessionDatabase } from "./client";
import { getMigrationsPath } from "./paths";

export const migrateSessionDatabase = () => {
  const migrationsFolder = getMigrationsPath();
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");

  if (!fs.existsSync(journalPath)) {
    throw new Error(`Missing Drizzle migrations at ${journalPath}`);
  }

  migrate(getSessionDatabase(), { migrationsFolder });
};
