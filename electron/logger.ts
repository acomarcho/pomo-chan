import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

const MAX_LOG_SIZE = 1 * 1024 * 1024; // 1 MB
const LOG_DIR = path.join(app.getPath("home"), ".pomo-chan", "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");

let initialized = false;

const ensureLogDir = () => {
  if (initialized) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    initialized = true;
  } catch {
    // If we can't create the log dir, silently give up
  }
};

const rotateIfNeeded = () => {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size > MAX_LOG_SIZE) {
      const rotated = LOG_FILE + ".old";
      try {
        fs.unlinkSync(rotated);
      } catch {
        // old file may not exist
      }
      fs.renameSync(LOG_FILE, rotated);
    }
  } catch {
    // File may not exist yet
  }
};

const write = (level: string, message: string, detail?: unknown) => {
  ensureLogDir();
  if (!initialized) return;

  rotateIfNeeded();

  const timestamp = new Date().toISOString();
  let line = `[${timestamp}] [${level}] ${message}`;
  if (detail !== undefined) {
    const detailStr =
      detail instanceof Error
        ? `${detail.message}${detail.stack ? "\n" + detail.stack : ""}`
        : typeof detail === "string"
          ? detail
          : JSON.stringify(detail);
    line += ` — ${detailStr}`;
  }
  line += "\n";

  try {
    fs.appendFileSync(LOG_FILE, line, "utf8");
  } catch {
    // Nothing we can do
  }
};

export const log = {
  info: (message: string, detail?: unknown) => write("INFO", message, detail),
  warn: (message: string, detail?: unknown) => write("WARN", message, detail),
  error: (message: string, detail?: unknown) => write("ERROR", message, detail),
  path: LOG_FILE
};
