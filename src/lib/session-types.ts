export type SessionAppUsage = {
  appName: string;
  startedAt: string;
  endedAt: string;
};

export type SessionRecord = {
  startedAt: string;
  endedAt: string;
  focusSeconds?: number | null;
  appUsage?: SessionAppUsage[];
};

export type SessionImportMode = "merge" | "overwrite";

export type SessionEntry = {
  id: number;
  startedAt: string;
  endedAt: string;
  focusSeconds?: number | null;
  hasUsage?: boolean;
};

export type SessionDetail = {
  id: number;
  startedAt: string;
  endedAt: string;
  focusSeconds?: number | null;
  appUsage: SessionAppUsage[];
};

export type SessionList = {
  items: SessionEntry[];
  total: number;
};

export type SessionTransferResult = {
  ok: boolean;
  count?: number;
  filePath?: string;
  reason?: "canceled" | "invalid-format" | "read-failed" | "write-failed";
};

export type SessionFocusSummary = {
  todaySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
};
