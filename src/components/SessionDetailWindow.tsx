import React, { useMemo, useState } from "react";
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

const normalizeWindowTitle = (value?: string | null) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getSegmentLabel = (segment: SessionAppUsage) => {
  const windowTitle = normalizeWindowTitle(segment.windowTitle);
  return windowTitle ? `${segment.appName}: ${windowTitle}` : segment.appName;
};

export const SessionDetailWindow = () => {
  const sessionId = useMemo(() => getSessionIdFromQuery(), []);
  const { data, isLoading, error, refresh, isAvailable } = useSessionDetail(sessionId);
  const [expandedApps, setExpandedApps] = useState<Record<string, boolean>>({});

  const segments = data?.appUsage ?? [];
  const appTotals = useMemo(() => {
    const map = new Map<
      string,
      {
        seconds: number;
        windows: Map<string, number>;
      }
    >();
    segments.forEach((segment) => {
      const seconds = getSegmentSeconds(segment);
      if (seconds <= 0) return;
      const current = map.get(segment.appName) ?? { seconds: 0, windows: new Map<string, number>() };
      current.seconds += seconds;
      const windowTitle = normalizeWindowTitle(segment.windowTitle);
      if (windowTitle) {
        current.windows.set(windowTitle, (current.windows.get(windowTitle) ?? 0) + seconds);
      }
      map.set(segment.appName, current);
    });
    return Array.from(map.entries())
      .map(([appName, value]) => ({
        appName,
        seconds: value.seconds,
        windows: Array.from(value.windows.entries())
          .map(([windowTitle, seconds]) => ({ windowTitle, seconds }))
          .sort((a, b) => b.seconds - a.seconds)
      }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [segments]);

  const totalSeconds = useMemo(() => {
    if (!data) return null;
    if (typeof data.focusSeconds === "number") {
      return data.focusSeconds;
    }
    return appTotals.reduce((sum, entry) => sum + entry.seconds, 0);
  }, [appTotals, data]);

  const toggleExpandedApp = (appName: string) => {
    setExpandedApps((current) => ({ ...current, [appName]: !current[appName] }));
  };

  return (
    <div className="min-h-screen bg-white px-4 py-5 text-gray-900">
      <header className="space-y-2 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Session details</p>
        <h1 className="text-2xl font-semibold">{sessionId ? `Session ${sessionId}` : "Session"}</h1>
        <p className="text-sm text-gray-500">Focus usage is captured only while the timer runs.</p>
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
          <span>Started at {data ? formatTimestamp(data.startedAt) : "-"}</span>
          <span>Ended at {data ? formatTimestamp(data.endedAt) : "-"}</span>
          <span>Total focus {formatDuration(totalSeconds ?? Number.NaN)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={refresh} disabled={!isAvailable || isLoading}>
            Refresh
          </Button>
        </div>
      </header>

      <section className="space-y-4">
        {error && <div className="text-sm text-red-500">{error}</div>}
        {isLoading && <div className="text-sm text-gray-500">Loading session data...</div>}
        {!isAvailable && <div className="text-sm text-gray-500">Session details are unavailable in this window.</div>}
        {!error && !isLoading && isAvailable && !data && <div className="text-sm text-gray-500">Session not found.</div>}

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-gray-900">Application usage summary</h2>
            <p className="text-xs text-gray-500">Distribution of focus time by application, then window title.</p>
          </div>
          <div className="mt-4 space-y-3">
            {appTotals.length === 0 && <p className="text-sm text-gray-500">No usage data recorded.</p>}
            {appTotals.map((entry) => {
              const total = totalSeconds ?? 0;
              const percent = total > 0 ? (entry.seconds / total) * 100 : 0;
              const hasWindowBreakdown = entry.windows.length > 0;
              const isExpanded = Boolean(expandedApps[entry.appName]);
              return (
                <div key={entry.appName} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
                    <div className="min-w-0 flex-1">
                      {hasWindowBreakdown ? (
                        <button
                          type="button"
                          className="max-w-full truncate text-left font-semibold text-gray-900 hover:text-gray-700"
                          onClick={() => toggleExpandedApp(entry.appName)}
                          title={`${isExpanded ? "Collapse" : "Expand"} ${entry.appName}`}
                        >
                          {isExpanded ? "v" : ">"} {entry.appName}
                        </button>
                      ) : (
                        <span className="truncate font-semibold text-gray-900" title={entry.appName}>
                          {entry.appName}
                        </span>
                      )}
                    </div>
                    <span className="tabular-nums text-gray-500">{formatDuration(entry.seconds)}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div className="h-2 rounded-full bg-gray-900" style={{ width: `${percent}%` }} />
                  </div>
                  {hasWindowBreakdown && isExpanded && (
                    <div className="mt-2 space-y-2 border-l border-gray-200 pl-3">
                      {entry.windows.map((windowEntry) => {
                        const childPercent = entry.seconds > 0 ? (windowEntry.seconds / entry.seconds) * 100 : 0;
                        return (
                          <div key={`${entry.appName}-${windowEntry.windowTitle}`} className="space-y-1">
                            <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                              <span className="truncate" title={windowEntry.windowTitle}>
                                {windowEntry.windowTitle}
                              </span>
                              <span className="tabular-nums">{formatDuration(windowEntry.seconds)}</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-gray-100">
                              <div className="h-1.5 rounded-full bg-gray-500" style={{ width: `${childPercent}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-gray-900">Detailed timeline</h2>
            <p className="text-xs text-gray-500">Each row represents a continuous active app interval.</p>
          </div>
          <div className="mt-4 divide-y divide-gray-200 text-sm">
            {segments.length === 0 && <div className="py-3 text-gray-500">No intervals recorded for this session.</div>}
            {segments.map((segment, index) => (
              <div
                key={`${segment.startedAt}-${segment.endedAt}-${index}`}
                className="flex items-center justify-between gap-2 py-2"
              >
                <span className="shrink-0 font-medium text-gray-900">
                  {formatTime(segment.startedAt)} - {formatTime(segment.endedAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-right text-gray-600" title={getSegmentLabel(segment)}>
                  {getSegmentLabel(segment)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
