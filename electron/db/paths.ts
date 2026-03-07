import { app } from "electron";
import path from "node:path";

export const getSessionDbPath = () => {
  return path.join(app.getPath("userData"), "pomo-chan.sqlite");
};

export const getMigrationsPath = () => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "drizzle");
  }

  return path.join(app.getAppPath(), "drizzle");
};
