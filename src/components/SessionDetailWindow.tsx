import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useSessionDetail } from "@/lib/hooks/session-hooks";
import type { SessionAppUsage } from "@/lib/session-types";

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "-";
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes === 0 && total > 0) {
    return "<1m";
  }
  return `${minutes}m`;
};

const getSessionIdFromQuery = () => {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("sessionId");
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const getSegmentSeconds = (segment: SessionAppUsage) => {
  const start = Date.parse(segment.startedAt);
  const end = Date.parse(segment.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }
  return Math.max(0, Math.round((end - start) / 1000));
};

export const SessionDetailWindow = () => {
  const sessionId = useMemo(() => getSessionIdFromQuery(), []);
  const { data, isLoading, error, refresh, isAvailable } =
    useSessionDetail(sessionId);

  const segments = data?.appUsage ?? [];
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    segments.forEach((segment) => {
      const seconds = getSegmentSeconds(segment);
      if (seconds <= 0) return;
      map.set(segment.appName, (map.get(segment.appName) ?? 0) + seconds);
    });
    return Array.from(map.entries())
      .map(([appName, seconds]) => ({ appName, seconds }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [segments]);

  const totalSeconds = useMemo(() => {
    if (!data) return null;
    if (typeof data.focusSeconds === "number") {
      return data.focusSeconds;
    }
    return totals.reduce((sum, entry) => sum + entry.seconds, 0);
  }, [data, totals]);

  return (
    <div className="min-h-screen bg-white px-4 py-5 text-gray-900">
      <header className="space-y-2 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
          Session details
        </p>
        <h1 className="text-2xl font-semibold">
          {sessionId ? `Session ${sessionId}` : "Session"}
        </h1>
        <p className="text-sm text-gray-500">
          Focus usage is captured only while the timer runs.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
          <span>Started at {data ? formatTimestamp(data.startedAt) : "-"}</span>
          <span>Ended at {data ? formatTimestamp(data.endedAt) : "-"}</span>
          <span>Total focus {formatDuration(totalSeconds ?? Number.NaN)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={refresh}
            disabled={!isAvailable || isLoading}
          >
            Refresh
          </Button>
        </div>
      </header>

      <section className="space-y-4">
        {error && <div className="text-sm text-red-500">{error}</div>}
        {isLoading && (
          <div className="text-sm text-gray-500">Loading session data...</div>
        )}
        {!isAvailable && (
          <div className="text-sm text-gray-500">
            Session details are unavailable in this window.
          </div>
        )}
        {!error && !isLoading && isAvailable && !data && (
          <div className="text-sm text-gray-500">Session not found.</div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-gray-900">
              Application usage summary
            </h2>
            <p className="text-xs text-gray-500">
              Distribution of focus time by application.
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {totals.length === 0 && (
              <p className="text-sm text-gray-500">No usage data recorded.</p>
            )}
            {totals.map((entry) => {
              const total = totalSeconds ?? 0;
              const percent = total > 0 ? (entry.seconds / total) * 100 : 0;
              return (
                <div key={entry.appName} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
                    <span
                      className="truncate font-semibold text-gray-900"
                      title={entry.appName}
                    >
                      {entry.appName}
                    </span>
                    <span className="tabular-nums text-gray-500">
                      {formatDuration(entry.seconds)}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full bg-gray-900"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-gray-900">
              Detailed timeline
            </h2>
            <p className="text-xs text-gray-500">
              Each row represents a continuous active app interval.
            </p>
          </div>
          <div className="mt-4 divide-y divide-gray-200 text-sm">
            {segments.length === 0 && (
              <div className="py-3 text-gray-500">
                No intervals recorded for this session.
              </div>
            )}
            {segments.map((segment, index) => (
              <div
                key={`${segment.startedAt}-${segment.endedAt}-${index}`}
                className="flex items-center justify-between gap-2 py-2"
              >
                <span className="shrink-0 font-medium text-gray-900">
                  {formatTime(segment.startedAt)} -{" "}
                  {formatTime(segment.endedAt)}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-right text-gray-600"
                  title={segment.appName}
                >
                  {segment.appName}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
