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
    <div className="window-shell">
      <header className="window-header">
        <p className="window-eyebrow">Session details</p>
        <h1 className="window-title">{sessionId ? `Session ${sessionId}` : "Session"}</h1>
        <p className="window-subtitle">Focus usage is captured only while the timer runs.</p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="neo-chip neo-mono normal-case tracking-normal font-semibold">
            Started at {data ? formatTimestamp(data.startedAt) : "-"}
          </span>
          <span className="neo-chip neo-mono normal-case tracking-normal font-semibold">
            Ended at {data ? formatTimestamp(data.endedAt) : "-"}
          </span>
          <span className="neo-chip neo-mono normal-case tracking-normal font-semibold">
            Total focus {formatDuration(totalSeconds ?? Number.NaN)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={refresh} disabled={!isAvailable || isLoading}>
            Refresh
          </Button>
        </div>
      </header>

      <section className="space-y-4">
        {error && <div className="text-sm font-semibold text-destructive">{error}</div>}
        {isLoading && <div className="text-sm text-muted-foreground">Loading session data...</div>}
        {!isAvailable && <div className="text-sm text-muted-foreground">Session details are unavailable in this window.</div>}
        {!error && !isLoading && isAvailable && !data && <div className="text-sm text-muted-foreground">Session not found.</div>}

        <div className="neo-panel">
          <div className="space-y-1">
            <h2 className="text-sm font-black uppercase tracking-[0.08em] text-foreground">Application usage summary</h2>
            <p className="text-xs text-muted-foreground">Distribution of focus time by application, then window title.</p>
          </div>
          <div className="mt-4 space-y-3">
            {appTotals.length === 0 && <p className="text-sm text-muted-foreground">No usage data recorded.</p>}
            {appTotals.map((entry) => {
              const total = totalSeconds ?? 0;
              const percent = total > 0 ? (entry.seconds / total) * 100 : 0;
              const hasWindowBreakdown = entry.windows.length > 0;
              const isExpanded = Boolean(expandedApps[entry.appName]);
              return (
                <div key={entry.appName} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <div className="min-w-0 flex-1">
                      {hasWindowBreakdown ? (
                        <button
                          type="button"
                          className="max-w-full cursor-pointer truncate text-left font-black uppercase tracking-[0.08em] text-foreground hover:text-primary"
                          onClick={() => toggleExpandedApp(entry.appName)}
                          title={`${isExpanded ? "Collapse" : "Expand"} ${entry.appName}`}
                        >
                          {isExpanded ? "v" : ">"} {entry.appName}
                        </button>
                      ) : (
                        <span className="truncate font-black uppercase tracking-[0.08em] text-foreground" title={entry.appName}>
                          {entry.appName}
                        </span>
                      )}
                    </div>
                    <span className="neo-mono font-black text-foreground">{formatDuration(entry.seconds)}</span>
                  </div>
                  <div className="neo-progress">
                    <div className="neo-progress-fill" style={{ width: `${percent}%` }} />
                  </div>
                  {hasWindowBreakdown && isExpanded && (
                    <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
                      {entry.windows.map((windowEntry) => {
                        const childPercent = entry.seconds > 0 ? (windowEntry.seconds / entry.seconds) * 100 : 0;
                        return (
                          <div key={`${entry.appName}-${windowEntry.windowTitle}`} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                              <span className="truncate" title={windowEntry.windowTitle}>
                                {windowEntry.windowTitle}
                              </span>
                              <span className="neo-mono text-foreground">{formatDuration(windowEntry.seconds)}</span>
                            </div>
                            <div className="h-2 w-full border-2 border-border bg-secondary">
                              <div className="h-full bg-muted-foreground" style={{ width: `${childPercent}%` }} />
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

        <div className="neo-panel">
          <div className="space-y-1">
            <h2 className="text-sm font-black uppercase tracking-[0.08em] text-foreground">Detailed timeline</h2>
            <p className="text-xs text-muted-foreground">Each row represents a continuous active app interval.</p>
          </div>
          <div className="mt-4 divide-y-2 divide-border text-sm">
            {segments.length === 0 && <div className="py-3 text-muted-foreground">No intervals recorded for this session.</div>}
            {segments.map((segment, index) => (
              <div
                key={`${segment.startedAt}-${segment.endedAt}-${index}`}
                className="flex items-center justify-between gap-3 py-3"
              >
                <span className="neo-mono shrink-0 font-black text-foreground">
                  {formatTime(segment.startedAt)} - {formatTime(segment.endedAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-right text-muted-foreground" title={getSegmentLabel(segment)}>
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
