import { useCallback, useEffect, useState } from "react";

export type SessionEntry = {
  id: number;
  startedAt: string;
  endedAt: string;
  focusSeconds?: number | null;
  hasUsage?: boolean;
};

export type SessionAppUsage = {
  appName: string;
  startedAt: string;
  endedAt: string;
};

export type SessionDetail = {
  id: number;
  startedAt: string;
  endedAt: string;
  focusSeconds?: number | null;
  appUsage: SessionAppUsage[];
};

type SessionList = {
  items: SessionEntry[];
  total: number;
};

type SessionTransferResult = {
  ok: boolean;
  count?: number;
  filePath?: string;
  reason?: "canceled" | "invalid-format" | "read-failed" | "write-failed";
};

export const useSessionRecorder = () => {
  const api = window.electronAPI?.sessions;

  const addSession = useCallback(
    async (value: {
      startedAt: string;
      endedAt: string;
      focusSeconds?: number | null;
      appUsage?: SessionAppUsage[];
    }) => {
      if (!api?.add) return;
      try {
        await api.add(value);
      } catch (error) {
        console.error("Failed to save session", error);
      }
    },
    [api],
  );

  return { addSession, isAvailable: Boolean(api?.add) };
};

export const useSessionHistory = (page: number, pageSize: number) => {
  const api = window.electronAPI?.sessions;
  const [data, setData] = useState<SessionList>({ items: [], total: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!api?.list) {
      setError(null);
      setData({ items: [], total: 0 });
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.list({ page, pageSize });
      setData(result);
    } catch {
      setError("Failed to load sessions.");
    } finally {
      setIsLoading(false);
    }
  }, [api, page, pageSize]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const exportSessions = useCallback(async () => {
    if (!api?.export) return null;
    return api.export() as Promise<SessionTransferResult>;
  }, [api]);

  const importSessions = useCallback(async () => {
    if (!api?.import) return null;
    return api.import() as Promise<SessionTransferResult>;
  }, [api]);

  return {
    data,
    isLoading,
    error,
    refresh,
    isAvailable: Boolean(api?.list),
    isTransferAvailable: Boolean(api?.export && api?.import),
    exportSessions,
    importSessions,
  };
};

export const useSessionDetail = (sessionId?: number | null) => {
  const api = window.electronAPI?.sessions;
  const [data, setData] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!api?.detail || !sessionId) {
      setError(null);
      setData(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.detail({ id: sessionId });
      if (!result) {
        setError("Session not found.");
        setData(null);
        return;
      }
      setData(result);
    } catch {
      setError("Failed to load session details.");
    } finally {
      setIsLoading(false);
    }
  }, [api, sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data,
    isLoading,
    error,
    refresh,
    isAvailable: Boolean(api?.detail),
  };
};
