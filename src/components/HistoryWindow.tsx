import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useSessionDetailsWindowOpener } from "@/lib/hooks/app-hooks";
import { useSessionHistory, useSessionSummary } from "@/lib/hooks/session-hooks";
import type { SessionImportMode } from "@/lib/session-types";
import type { DateRange } from "react-day-picker";

const PAGE_SIZE = 10;

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true
});

const formatDatePart = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
};

const getDurationMinutes = (startedAt: string, endedAt: string, focusSeconds?: number | null) => {
  if (typeof focusSeconds === "number" && Number.isFinite(focusSeconds)) {
    return Math.max(0, Math.round(focusSeconds / 60));
  }
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return Math.max(0, minutes);
};

const formatSessionTimeRange = (startedAt: string, endedAt: string, focusSeconds?: number | null) => {
  const start = new Date(startedAt);
  const end = new Date(endedAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "-";
  }

  const sameDay =
    start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
  const durationMinutes = getDurationMinutes(startedAt, endedAt, focusSeconds);
  const durationSuffix = typeof durationMinutes === "number" ? ` (${durationMinutes} mins)` : "";
  const startLabel = `${formatDatePart(start)} ${timeFormatter.format(start)}`;

  if (sameDay) {
    return `${startLabel} - ${timeFormatter.format(end)}${durationSuffix}`;
  }

  return `${startLabel} - ${formatDatePart(end)} ${timeFormatter.format(end)}${durationSuffix}`;
};

const formatFocusDuration = (seconds: number) => {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return {
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0")
  };
};

export const HistoryWindow = () => {
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Convert DateRange to ISO strings for API
  const apiDateRange = useMemo(() => {
    if (!dateRange?.from) return undefined;
    return {
      startDate: dateRange.from.toISOString(),
      endDate: dateRange.to ? dateRange.to.toISOString() : dateRange.from.toISOString()
    };
  }, [dateRange]);

  const {
    data,
    isLoading,
    error,
    refresh,
    isAvailable,
    isTransferAvailable,
    isClearAvailable,
    exportSessions,
    importSessions,
    clearSessions
  } = useSessionHistory(page, PAGE_SIZE, apiDateRange);
  const {
    summary,
    isLoading: isSummaryLoading,
    error: summaryError,
    refresh: refreshSummary,
    isAvailable: isSummaryAvailable
  } = useSessionSummary();
  const { openSessionDetailsWindow, isAvailable: isDetailsAvailable } = useSessionDetailsWindowOpener();
  const [isTransferring, setIsTransferring] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [importMode, setImportMode] = useState<SessionImportMode>("merge");

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
  const canClear = isClearAvailable && !isTransferring;
  const firstResultIndex = data.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResultIndex = data.total === 0 ? 0 : Math.min(page * PAGE_SIZE, data.total);
  const pageItems = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    const firstPage = 1;
    const lastPage = totalPages;
    const start = Math.max(firstPage + 1, page - 1);
    const end = Math.min(lastPage - 1, page + 1);
    const items: Array<number | "dots-start" | "dots-end"> = [firstPage];

    if (start > firstPage + 1) {
      items.push("dots-start");
    }

    for (let currentPage = start; currentPage <= end; currentPage += 1) {
      items.push(currentPage);
    }

    if (end < lastPage - 1) {
      items.push("dots-end");
    }

    items.push(lastPage);
    return items;
  }, [page, totalPages]);
  const summarySnapshot = summary ?? {
    todaySeconds: 0,
    weekSeconds: 0,
    monthSeconds: 0
  };
  const summaryCards = [
    {
      id: "today",
      label: "focused today",
      seconds: summarySnapshot.todaySeconds,
      gradient: "bg-[#ffe0b5]",
      accent: "bg-primary"
    },
    {
      id: "week",
      label: "focused in 7 days",
      seconds: summarySnapshot.weekSeconds,
      gradient: "bg-[#d7efff]",
      accent: "bg-sky-400"
    },
    {
      id: "month",
      label: "focused last 30 days",
      seconds: summarySnapshot.monthSeconds,
      gradient: "bg-[#d7f5dc]",
      accent: "bg-emerald-400"
    }
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

  const runImport = async (mode: SessionImportMode) => {
    setIsTransferring(true);
    try {
      const result = await importSessions(mode);
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
    setShowImportConfirm(true);
  };

  const handleConfirmImport = () => {
    setShowImportConfirm(false);
    void runImport(importMode);
  };

  const runClear = async () => {
    setIsTransferring(true);
    try {
      const result = await clearSessions();
      if (!result || !result.ok) {
        toast.error("Failed to clear sessions.");
        return;
      }
      if ((result.count ?? 0) > 0) {
        toast.success(`Cleared ${result.count ?? 0} sessions.`);
      } else {
        toast.success("Session history is already empty.");
      }
      void refreshSummary();
      if (page === 1) {
        void refresh();
      } else {
        setPage(1);
      }
    } catch {
      toast.error("Failed to clear sessions.");
    } finally {
      setIsTransferring(false);
    }
  };

  const handleClear = () => {
    setShowClearConfirm(true);
  };

  const handleConfirmClear = () => {
    setShowClearConfirm(false);
    void runClear();
  };

  const handleRefresh = () => {
    void refresh();
    void refreshSummary();
  };

  return (
    <div className="window-shell py-6">
      <header className="window-header">
        <p className="window-eyebrow">History</p>
        <h1 className="window-title">Completed sessions</h1>
        <p className="window-subtitle">Only completed focus sessions are saved.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExport} disabled={!canTransfer}>
            Export
          </Button>
          <Button size="sm" variant="outline" onClick={handleImport} disabled={!canTransfer}>
            Import
          </Button>
          <Button size="sm" variant="destructive" onClick={handleClear} disabled={!canClear}>
            Clear
          </Button>
        </div>
      </header>

      <section className="space-y-4">
        <div className={`grid grid-cols-3 gap-3 ${isSummaryLoading ? "opacity-70" : ""}`}>
          {summaryCards.map((card) => {
            const time = formatFocusDuration(card.seconds);
            return (
              <div key={card.id} className={`neo-surface ${card.gradient} px-4 py-4`}>
                <div className="flex items-center justify-between">
                  <span className={`h-2 w-12 border-2 border-border ${card.accent}`} />
                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">Focus</span>
                </div>
                <div className="neo-mono mt-3 flex flex-wrap items-baseline gap-2 text-foreground">
                  <span className="text-2xl font-black tabular-nums">{time.hours}</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">hrs</span>
                  <span className="text-2xl font-black tabular-nums">{time.minutes}</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">mins</span>
                </div>
                <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">{card.label}</p>
              </div>
            );
          })}
        </div>
        {!isSummaryAvailable && <p className="text-xs text-muted-foreground">Summary stats are unavailable in this window.</p>}
        {summaryError && <p className="text-xs font-semibold text-destructive">{summaryError}</p>}
        <Dialog open={showImportConfirm} onOpenChange={setShowImportConfirm}>
          <DialogContent className="text-left">
            <DialogHeader>
              <DialogTitle>Import sessions</DialogTitle>
              <DialogDescription>Choose how the imported sessions should be applied.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <RadioGroup
                value={importMode}
                onValueChange={(value) => setImportMode(value as SessionImportMode)}
                className="gap-3"
              >
                <label
                  htmlFor="import-merge"
                  className="flex cursor-pointer items-start gap-3 border-2 border-border bg-card px-3 py-3 text-sm transition hover:-translate-x-px hover:-translate-y-px"
                >
                  <RadioGroupItem id="import-merge" value="merge" className="mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-black uppercase tracking-[0.08em] text-foreground">Merge</p>
                    <p className="text-xs text-muted-foreground">Keep existing sessions and add entries from the import.</p>
                  </div>
                </label>
                <label
                  htmlFor="import-overwrite"
                  className="flex cursor-pointer items-start gap-3 border-2 border-border bg-card px-3 py-3 text-sm transition hover:-translate-x-px hover:-translate-y-px"
                >
                  <RadioGroupItem id="import-overwrite" value="overwrite" className="mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-black uppercase tracking-[0.08em] text-foreground">Overwrite</p>
                    <p className="text-xs text-muted-foreground">Replace all current sessions with the imported file.</p>
                  </div>
                </label>
              </RadioGroup>
              {importMode === "overwrite" && (
                <p className="text-xs font-black uppercase tracking-[0.08em] text-destructive">
                  Overwrite will remove all existing sessions on this device.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowImportConfirm(false)} disabled={isTransferring}>
                Cancel
              </Button>
              <Button
                variant={importMode === "overwrite" ? "destructive" : "default"}
                type="button"
                onClick={handleConfirmImport}
                disabled={isTransferring}
              >
                {importMode === "overwrite" ? "Overwrite sessions" : "Import"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
          <DialogContent className="text-left">
            <DialogHeader>
              <DialogTitle>Clear all sessions?</DialogTitle>
              <DialogDescription>
                This will permanently delete all saved sessions from this device. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowClearConfirm(false)} disabled={isTransferring}>
                Cancel
              </Button>
              <Button variant="destructive" type="button" onClick={handleConfirmClear} disabled={isTransferring}>
                Clear all sessions
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="neo-toolbar">
          <Popover>
            <PopoverTrigger>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
                    </>
                  ) : (
                    format(dateRange.from, "MMM d, yyyy")
                  )
                ) : (
                  "Filter by date"
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => {
                  setDateRange(range);
                  setPage(1); // Reset to first page when filter changes
                }}
                numberOfMonths={2}
              />
              {dateRange && (
                <div className="border-t-2 border-border p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setDateRange(undefined);
                      setPage(1);
                    }}
                  >
                    Clear filter
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className="neo-toolbar justify-between">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
            Total {data.total} · Showing {firstResultIndex} to {lastResultIndex}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button size="sm" variant="outline" onClick={handleRefresh} disabled={isLoading || !isAvailable}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="neo-surface overflow-hidden">
          {error && <div className="px-4 py-3 text-sm font-semibold text-destructive">{error}</div>}
          {!isAvailable && (
            <div className="px-4 py-6 text-sm text-muted-foreground">Session history is unavailable in this window.</div>
          )}
          {showEmpty && <div className="px-4 py-6 text-sm text-muted-foreground">No completed sessions yet.</div>}
          {!showEmpty && isAvailable && (
            <Table>
              <TableHeader className="bg-secondary text-xs font-black uppercase tracking-[0.18em] text-muted-foreground [&_tr]:border-b-border">
                <TableRow>
                  <TableHead className="px-4 py-3">ID</TableHead>
                  <TableHead className="px-4 py-3 whitespace-normal">Time range</TableHead>
                  <TableHead className="px-4 py-3">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((session) => (
                  <TableRow key={session.id} className="border-border">
                    <TableCell className="neo-mono px-4 py-3 font-black text-foreground">{session.id}</TableCell>
                    <TableCell className="px-4 py-3 whitespace-normal text-foreground/80">
                      {formatSessionTimeRange(session.startedAt, session.endedAt, session.focusSeconds)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openSessionDetailsWindow(session.id)}
                        disabled={!session.hasUsage || !isDetailsAvailable}
                      >
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="border-t-2 border-border bg-card">
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        Showing {firstResultIndex} to {lastResultIndex} of {data.total} sessions
                      </p>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => setPage(1)} disabled={!canPrevious || isLoading}>
                          First
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                          disabled={!canPrevious || isLoading}
                        >
                          Prev
                        </Button>
                        {pageItems.map((item, index) => {
                          if (typeof item !== "number") {
                            return (
                              <span key={`${item}-${index}`} className="px-2 text-xs font-black text-muted-foreground">
                                …
                              </span>
                            );
                          }

                          return (
                            <Button
                              key={item}
                              size="sm"
                              variant={item === page ? "default" : "outline"}
                              onClick={() => setPage(item)}
                              disabled={isLoading}
                            >
                              {item}
                            </Button>
                          );
                        })}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                          disabled={!canNext || isLoading}
                        >
                          Next
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setPage(totalPages)} disabled={!canNext || isLoading}>
                          Last
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
};
