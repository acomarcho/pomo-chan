import { useCallback, useEffect, useState } from "react";

export type SessionEntry = {
  id: number;
  startedAt: string;
  endedAt: string;
};

type SessionList = {
  items: SessionEntry[];
  total: number;
};

export const useSessionRecorder = () => {
  const api = window.electronAPI?.sessions;

  const addSession = useCallback(
    async (value: { startedAt: string; endedAt: string }) => {
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
    } catch (err) {
      setError("Failed to load sessions.");
    } finally {
      setIsLoading(false);
    }
  }, [api, page, pageSize]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data,
    isLoading,
    error,
    refresh,
    isAvailable: Boolean(api?.list),
  };
};
