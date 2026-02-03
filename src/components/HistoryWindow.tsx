import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSessionHistory } from "@/lib/hooks/session-hooks";

const PAGE_SIZE = 10;

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const formatDurationMinutes = (startedAt: string, endedAt: string) => {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-";
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return String(Math.max(0, minutes));
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
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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

  const handleExport = async () => {
    setActionMessage(null);
    setActionError(null);
    setIsTransferring(true);
    try {
      const result = await exportSessions();
      if (!result || !result.ok) {
        if (result?.reason !== "canceled") {
          setActionError("Failed to export sessions.");
        }
        return;
      }
      setActionMessage(`Exported ${result.count ?? 0} sessions.`);
    } catch {
      setActionError("Failed to export sessions.");
    } finally {
      setIsTransferring(false);
    }
  };

  const runImport = async () => {
    setActionMessage(null);
    setActionError(null);
    setIsTransferring(true);
    try {
      const result = await importSessions();
      if (!result || !result.ok) {
        if (result?.reason !== "canceled") {
          setActionError("Failed to import sessions.");
        }
        return;
      }
      setActionMessage(`Imported ${result.count ?? 0} sessions.`);
      if (page === 1) {
        void refresh();
      } else {
        setPage(1);
      }
    } catch {
      setActionError("Failed to import sessions.");
    } finally {
      setIsTransferring(false);
    }
  };

  const handleImport = () => {
    setActionMessage(null);
    setActionError(null);
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

  return (
    <div className="min-h-screen bg-white px-4 py-5 text-gray-900">
      <header className="space-y-2 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
          History
        </p>
        <h1 className="text-2xl font-semibold">Completed sessions</h1>
        <p className="text-sm text-gray-500">
          Only completed focus sessions are saved.
        </p>
      </header>

      <section className="space-y-3">
        <Dialog
          open={showImportConfirm}
          onOpenChange={setShowImportConfirm}
        >
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
              onClick={refresh}
              disabled={isLoading || !isAvailable}
            >
              Refresh
            </Button>
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
          {actionMessage && (
            <div className="px-4 py-3 text-sm text-emerald-600">
              {actionMessage}
            </div>
          )}
          {actionError && (
            <div className="px-4 py-3 text-sm text-red-500">{actionError}</div>
          )}
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
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatTimestamp(session.startedAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatTimestamp(session.endedAt)}
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
