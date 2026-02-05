import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSessionDetailsWindowOpener } from "@/lib/hooks/app-hooks";
import {
  useSessionHistory,
  useSessionSummary,
} from "@/lib/hooks/session-hooks";

const PAGE_SIZE = 10;

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const formatDurationMinutes = (
  startedAt: string,
  endedAt: string,
  focusSeconds?: number | null,
) => {
  if (typeof focusSeconds === "number" && Number.isFinite(focusSeconds)) {
    const minutes = Math.round(focusSeconds / 60);
    return String(Math.max(0, minutes));
  }
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-";
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return String(Math.max(0, minutes));
};

const formatFocusDuration = (seconds: number) => {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return {
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
  };
};

export const HistoryWindow = () => {
  const [page, setPage] = useState(1);
  const {
    data,
    isLoading,
    error,
    refresh,
    isAvailable,
    isTransferAvailable,
    exportSessions,
    importSessions,
  } = useSessionHistory(page, PAGE_SIZE);
  const {
    summary,
    isLoading: isSummaryLoading,
    error: summaryError,
    refresh: refreshSummary,
    isAvailable: isSummaryAvailable,
  } = useSessionSummary();
  const { openSessionDetailsWindow, isAvailable: isDetailsAvailable } =
    useSessionDetailsWindowOpener();
  const [isTransferring, setIsTransferring] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);

  const totalPages = useMemo(() => {
    if (data.total === 0) return 1;
    return Math.ceil(data.total / PAGE_SIZE);
  }, [data.total]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const canPrevious = page > 1;
  const canNext = page < totalPages;
  const showEmpty = !isLoading && data.items.length === 0;
  const canTransfer = isTransferAvailable && !isTransferring;
  const summarySnapshot = summary ?? {
    todaySeconds: 0,
    weekSeconds: 0,
    monthSeconds: 0,
  };
  const summaryCards = [
    {
      id: "today",
      label: "focused today",
      seconds: summarySnapshot.todaySeconds,
      gradient: "from-amber-50/90 via-white to-amber-100/70",
      accent: "bg-amber-400/80",
    },
    {
      id: "week",
      label: "focused in 7 days",
      seconds: summarySnapshot.weekSeconds,
      gradient: "from-sky-50/90 via-white to-sky-100/70",
      accent: "bg-sky-400/80",
    },
    {
      id: "month",
      label: "focused last 30 days",
      seconds: summarySnapshot.monthSeconds,
      gradient: "from-emerald-50/90 via-white to-emerald-100/70",
      accent: "bg-emerald-400/80",
    },
  ];

  const handleExport = async () => {
    setIsTransferring(true);
    try {
      const result = await exportSessions();
      if (!result || !result.ok) {
        if (result?.reason !== "canceled") {
          toast.error("Failed to export sessions.");
        }
        return;
      }
      toast.success(`Exported ${result.count ?? 0} sessions.`);
    } catch {
      toast.error("Failed to export sessions.");
    } finally {
      setIsTransferring(false);
    }
  };

  const runImport = async () => {
    setIsTransferring(true);
    try {
      const result = await importSessions();
      if (!result || !result.ok) {
        if (result?.reason !== "canceled") {
          toast.error("Failed to import sessions.");
        }
        return;
      }
      toast.success(`Imported ${result.count ?? 0} sessions.`);
      void refreshSummary();
      if (page === 1) {
        void refresh();
      } else {
        setPage(1);
      }
    } catch {
      toast.error("Failed to import sessions.");
    } finally {
      setIsTransferring(false);
    }
  };

  const handleImport = () => {
    if (data.total > 0) {
      setShowImportConfirm(true);
      return;
    }
    void runImport();
  };

  const handleConfirmImport = () => {
    setShowImportConfirm(false);
    void runImport();
  };

  const handleRefresh = () => {
    void refresh();
    void refreshSummary();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-white to-slate-50 px-4 py-6 text-gray-900">
      <header className="space-y-2 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
          History
        </p>
        <h1 className="text-2xl font-semibold">Completed sessions</h1>
        <p className="text-sm text-gray-500">
          Only completed focus sessions are saved.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={!canTransfer}
          >
            Export
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleImport}
            disabled={!canTransfer}
          >
            Import
          </Button>
        </div>
      </header>

      <section className="space-y-4">
        <div
          className={`grid grid-cols-3 gap-3 ${isSummaryLoading ? "opacity-70" : ""}`}
        >
          {summaryCards.map((card) => {
            const time = formatFocusDuration(card.seconds);
            return (
              <div
                key={card.id}
                className={`rounded-2xl border border-slate-200/70 bg-gradient-to-br ${card.gradient} px-4 py-4 shadow-sm`}
              >
                <div className="flex items-center justify-between">
                  <span className={`h-1.5 w-10 rounded-full ${card.accent}`} />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Focus
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-baseline gap-2 text-slate-900">
                  <span className="text-2xl font-semibold tabular-nums">
                    {time.hours}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    hrs
                  </span>
                  <span className="text-2xl font-semibold tabular-nums">
                    {time.minutes}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    mins
                  </span>
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  {card.label}
                </p>
              </div>
            );
          })}
        </div>
        {!isSummaryAvailable && (
          <p className="text-xs text-slate-500">
            Summary stats are unavailable in this window.
          </p>
        )}
        {summaryError && <p className="text-xs text-red-500">{summaryError}</p>}
        <Dialog open={showImportConfirm} onOpenChange={setShowImportConfirm}>
          <DialogContent className="text-left">
            <DialogHeader>
              <DialogTitle>Replace session history?</DialogTitle>
              <DialogDescription>
                Importing will remove all existing sessions from this device.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setShowImportConfirm(false)}
                disabled={isTransferring}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                type="button"
                onClick={handleConfirmImport}
                disabled={isTransferring}
              >
                Replace sessions
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
            Total {data.total}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={isLoading || !isAvailable}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={!canPrevious || isLoading}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={!canNext || isLoading}
            >
              Next
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {error && (
            <div className="px-4 py-3 text-sm text-red-500">{error}</div>
          )}
          {!isAvailable && (
            <div className="px-4 py-6 text-sm text-gray-500">
              Session history is unavailable in this window.
            </div>
          )}
          {showEmpty && (
            <div className="px-4 py-6 text-sm text-gray-500">
              No completed sessions yet.
            </div>
          )}
          {!showEmpty && isAvailable && (
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Duration (min)</th>
                  <th className="px-4 py-3">Started at</th>
                  <th className="px-4 py-3">Ended at</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((session) => (
                  <tr key={session.id} className="border-t border-gray-200">
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {session.id}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatDurationMinutes(
                        session.startedAt,
                        session.endedAt,
                        session.focusSeconds,
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatTimestamp(session.startedAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatTimestamp(session.endedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openSessionDetailsWindow(session.id)}
                        disabled={!session.hasUsage || !isDetailsAvailable}
                      >
                        Show details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};
