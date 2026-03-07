import type { AmbientSound } from "../lib/ambient";
import type {
  SessionDetail,
  SessionFocusSummary,
  SessionImportMode,
  SessionList,
  SessionRecord,
  SessionTransferResult
} from "../lib/session-types";

export type AudioLanguage = "en" | "jp";

export type ActiveAppInfo = {
  title: string;
  ownerName: string;
};

export type ActiveAppDebugInfo = ActiveAppInfo & {
  error?: string;
};

export type AppConfig = {
  playTick: boolean;
  audioLanguage: AudioLanguage;
  ambientVolumes: Record<AmbientSound, number>;
  focusMinutes: number;
  breakMinutes: number;
};

export const IPC = {
  alwaysOnTop: {
    get: "always-on-top:get",
    set: "always-on-top:set"
  },
  activeApp: {
    get: "active-app:get",
    debug: "active-app:debug"
  },
  config: {
    get: "config:get",
    set: "config:set",
    changed: "config:changed",
    open: "config:open"
  },
  history: {
    open: "history:open"
  },
  focusSession: {
    setActive: "focus-session:set-active"
  },
  sessions: {
    add: "session:add",
    list: "sessions:list",
    detail: "sessions:detail",
    summary: "sessions:summary",
    export: "sessions:export",
    import: "sessions:import",
    delete: "sessions:delete",
    clear: "sessions:clear"
  },
  sessionDetails: {
    open: "session-details:open"
  }
} as const;

export type IpcInvokeContract = {
  [IPC.alwaysOnTop.get]: {
    args: [];
    return: boolean;
  };
  [IPC.alwaysOnTop.set]: {
    args: [value: boolean];
    return: boolean;
  };
  [IPC.activeApp.get]: {
    args: [];
    return: ActiveAppInfo;
  };
  [IPC.activeApp.debug]: {
    args: [];
    return: ActiveAppDebugInfo;
  };
  [IPC.config.get]: {
    args: [];
    return: AppConfig;
  };
  [IPC.config.set]: {
    args: [value: Partial<AppConfig>];
    return: AppConfig;
  };
  [IPC.config.open]: {
    args: [];
    return: boolean;
  };
  [IPC.history.open]: {
    args: [];
    return: boolean;
  };
  [IPC.sessionDetails.open]: {
    args: [sessionId: number];
    return: boolean;
  };
  [IPC.sessions.add]: {
    args: [value: SessionRecord];
    return: number;
  };
  [IPC.sessions.list]: {
    args: [value: { page: number; pageSize: number; startDate?: string; endDate?: string }];
    return: SessionList;
  };
  [IPC.sessions.detail]: {
    args: [value: { id: number }];
    return: SessionDetail | null;
  };
  [IPC.sessions.summary]: {
    args: [];
    return: SessionFocusSummary;
  };
  [IPC.sessions.export]: {
    args: [];
    return: SessionTransferResult;
  };
  [IPC.sessions.import]: {
    args: [value: { mode: SessionImportMode }];
    return: SessionTransferResult;
  };
  [IPC.sessions.delete]: {
    args: [value: { id: number }];
    return: { ok: boolean };
  };
  [IPC.sessions.clear]: {
    args: [];
    return: SessionTransferResult;
  };
};

export type IpcSendContract = {
  [IPC.focusSession.setActive]: [value: boolean];
};

export type IpcRendererEventContract = {
  [IPC.config.changed]: [value: AppConfig];
};

export interface ElectronAPI {
  alwaysOnTop: {
    get: () => Promise<boolean>;
    set: (value: boolean) => Promise<boolean>;
  };
  activeApp: {
    get: () => Promise<ActiveAppInfo>;
    debug: () => Promise<ActiveAppDebugInfo>;
  };
  config: {
    get: () => Promise<AppConfig>;
    set: (value: Partial<AppConfig>) => Promise<AppConfig>;
    onChange: (callback: (value: AppConfig) => void) => () => void;
    openWindow: () => Promise<boolean>;
  };
  history: {
    openWindow: () => Promise<boolean>;
  };
  focusSession: {
    setActive: (value: boolean) => void;
  };
  sessionDetails: {
    openWindow: (sessionId: number) => Promise<boolean>;
  };
  sessions: {
    add: (value: SessionRecord) => Promise<number>;
    list: (value: { page: number; pageSize: number; startDate?: string; endDate?: string }) => Promise<SessionList>;
    detail: (value: { id: number }) => Promise<SessionDetail | null>;
    summary: () => Promise<SessionFocusSummary>;
    export: () => Promise<SessionTransferResult>;
    import: (value: { mode: SessionImportMode }) => Promise<SessionTransferResult>;
    delete: (value: { id: number }) => Promise<{ ok: boolean }>;
    clear: () => Promise<SessionTransferResult>;
  };
}
