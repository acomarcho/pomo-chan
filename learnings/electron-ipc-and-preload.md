# How IPC and preload work in this Electron app

## Plain-English summary

This app does not have a web-style backend server.

There is no Express app, no `/api` route, and no browser making HTTP requests to a separate machine.

Instead, the app is split into local parts that talk to each other:

1. The **renderer process** runs the React app.
2. The **main process** runs Electron's desktop-native logic.
3. The **preload script** sits between them and exposes a small safe API to the React app.
4. A small **native Swift helper** handles active-window detection for macOS.

The important idea is this:

- React owns the UI.
- The main process owns native power.
- Preload defines the contract between them.

If you remember one sentence from this note, remember this one:

> The renderer asks, the main process does, and preload decides what the renderer is allowed to ask for.

## Terms first

### Process

A **process** is a running program with its own memory.

In this app:

- the React UI runs in one process
- Electron's main app logic runs in another process
- the Swift active-window helper runs in a third process

### Renderer process

The **renderer process** is the browser-like environment where the React app runs.

If you are a web developer, this is the part that feels most familiar. It renders HTML, runs React hooks, responds to clicks, and updates the screen.

### Main process

The **main process** is Electron's central process.

It can do things normal browser JavaScript cannot do directly, such as:

- create native windows
- show file dialogs
- read and write local files
- access a local SQLite database
- spawn child processes

### IPC

**IPC** means **inter-process communication**.

That just means one process sends a message to another process.

In a web app, the browser usually talks to a server over HTTP.
In Electron, the renderer usually talks to the main process over IPC.

### Preload script

A **preload script** is trusted code that runs before the web page loads inside an Electron window.

It has more privileges than the React page, but it still runs close to the renderer.

Its main job is to expose a small safe API onto `window`, so the renderer can ask for native work without getting direct access to all of Electron.

### Context isolation

**Context isolation** is an Electron security feature.

It means the preload script and the web page do not share the exact same JavaScript world, even though they both interact with the same window.

Because of that, preload should use `contextBridge.exposeInMainWorld(...)` instead of assigning random values directly onto `window`.

Electron recommends this pattern in the official docs.

## Why Electron splits things this way

If the React app had full access to Node.js and Electron APIs, the UI would be too powerful.

That would make the app harder to reason about and much less safe. A bug in the page would also become a bug with filesystem, process, and window-management access.

So Electron intentionally separates responsibilities:

- **renderer**: render the UI and handle user interactions
- **main**: perform privileged desktop work
- **preload**: define the safe bridge between them

This is why Electron feels different from both a normal web app and a normal native app.

It is mixing browser-style UI with desktop-native capabilities, so it needs a clear boundary between "what draws pixels" and "what talks to the operating system".

## Why `ipcRenderer` and `ipcMain` have different names

These are not two unrelated systems.

They are the two ends of the same messaging system.

Electron names them by **where they run**:

- `ipcRenderer` is the renderer-side messenger
- `ipcMain` is the main-process-side receiver/handler

The naming is deliberate.

If both sides were just called `ipc`, it would be harder to tell which code belongs in the UI layer and which code belongs in the native layer.

Electron wants the process boundary to stay obvious in the code.

You can think of it like this:

- `ipcRenderer.invoke(...)` means "the UI is asking for something"
- `ipcMain.handle(...)` means "the native side knows how to answer that request"

There is also a second naming pair for message style:

- `invoke` / `handle`: request and response
- `send` / `on`: fire-and-forget event

So there are really two questions being answered by the API names:

1. Which side am I on?
2. What kind of conversation is this?

## Why preload exists

Preload exists so the renderer does **not** have to import raw Electron APIs directly.

Without preload, a renderer might try to do something like this:

```ts
import { ipcRenderer } from "electron";

await ipcRenderer.invoke("sessions:list", { page: 1, pageSize: 20 });
```

That may look convenient, but it is a weak boundary.

Now the React app knows about raw Electron internals, raw IPC channel names, and potentially many more privileged APIs than it should.

Preload improves this in several ways:

- **Security**: the page only gets approved capabilities.
- **Clarity**: React sees app-level actions like `sessions.list()` instead of low-level Electron plumbing.
- **Centralization**: the Electron bridge lives in one place.
- **Stability**: if IPC channels change, you update preload instead of many React components.
- **Type safety**: TypeScript can describe the `window.electronAPI` surface.

Plain English version:

> Preload is a custom SDK for your renderer.

## How this app wires it together

This repo uses the same preload file for every Electron window.

The full flow is:

1. The main process creates a `BrowserWindow`.
2. That window registers `preload.js`.
3. Preload exposes `window.electronAPI`.
4. React calls methods on `window.electronAPI`.
5. Preload converts those calls into IPC messages.
6. The main process handles the IPC and does the native work.
7. The result comes back to React.

### Step 1: the main process registers the preload script

From [`electron/main.ts`](../electron/main.ts):

```ts
mainWindow = new BrowserWindow({
  width: 360,
  height: 500,
  minWidth: 360,
  minHeight: 500,
  maxWidth: 360,
  maxHeight: 500,
  resizable: false,
  webPreferences: {
    preload: path.join(__dirname, "preload.js")
  }
});
```

This line is the handoff.

It tells Electron:

- open a native window
- load the web UI into it
- run the preload script before the page starts

The same preload is also registered for the settings, history, and session-details windows in the same file.

### Step 2: preload exposes a safe API onto `window`

From [`electron/preload.ts`](../electron/preload.ts):

```ts
import { contextBridge, ipcRenderer } from "electron";

const sessions = {
  list: (value: { page: number; pageSize: number; startDate?: string; endDate?: string }) =>
    ipcRenderer.invoke("sessions:list", value) as Promise<SessionList>
};

contextBridge.exposeInMainWorld("electronAPI", {
  sessions
});
```

This is the preload script doing its main job.

It does **not** expose raw access to everything in Electron.
It exposes a small object called `window.electronAPI`.

That object contains allowed actions like:

- `config.get()`
- `config.set()`
- `sessions.list()`
- `sessions.add()`
- `history.openWindow()`
- `activeApp.get()`

This makes the React code cleaner and gives the app a single place to define the renderer-to-main contract.

### Step 3: the main process registers the IPC handlers

From [`electron/main.ts`](../electron/main.ts):

```ts
ipcMain.handle("sessions:list", (_event, value: { page: number; pageSize: number; startDate?: string; endDate?: string }) => {
  return listSessions(value.page, value.pageSize, { startDate: value.startDate, endDate: value.endDate });
});
```

This means:

- if some renderer invokes the channel `sessions:list`
- the main process will run this function
- the returned value is sent back to the renderer

Here is a second example for app config:

```ts
ipcMain.handle("config:get", () => {
  return getConfig();
});
```

And one more for a fire-and-forget event:

```ts
ipcMain.on("focus-session:set-active", (event, isActive: boolean) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow || senderWindow !== mainWindow) {
    return;
  }
  hasActiveFocusSession = Boolean(isActive);
});
```

That one does not return a value. It is just a notification.

### Step 4: the React app uses `window.electronAPI`

From [`src/lib/hooks/session-hooks.ts`](../src/lib/hooks/session-hooks.ts):

```ts
export const useSessionHistory = (page: number, pageSize: number, dateRange?: { startDate?: string; endDate?: string }) => {
  const api = window.electronAPI?.sessions;

  const refresh = useCallback(async () => {
    if (!api?.list) return;
    const result = await api.list({
      page,
      pageSize,
      startDate: dateRange?.startDate,
      endDate: dateRange?.endDate
    });
    setData(result);
  }, [api, page, pageSize, dateRange?.startDate, dateRange?.endDate]);
```

Notice what the React code does **not** know about:

- `ipcRenderer`
- `ipcMain`
- the exact implementation of SQLite
- file dialog APIs
- child process APIs

That is the value of preload.

## One full example: loading session history

This is the full round-trip for session history.

### React side

The history window calls:

```ts
window.electronAPI?.sessions?.list({ page, pageSize, startDate, endDate });
```

### Preload side

Preload translates that into:

```ts
ipcRenderer.invoke("sessions:list", value);
```

### Main side

The main process receives it here:

```ts
ipcMain.handle("sessions:list", (_event, value) => {
  return listSessions(value.page, value.pageSize, {
    startDate: value.startDate,
    endDate: value.endDate
  });
});
```

### Storage side

Then the main process calls into SQLite code in [`electron/session-store.ts`](../electron/session-store.ts):

```ts
export const listSessions = (
  page: number,
  pageSize: number,
  dateRange?: { startDate?: string; endDate?: string }
): SessionList => {
  const database = ensureDb();
  // query SQLite and return rows
};
```

So the browser-like React app never opens SQLite itself.
It asks the main process to do that work.

## Another example: active app detection

This app has one especially native feature: it tracks the frontmost app and sometimes its window title during a focus session.

That flow is:

1. React polls `activeApp.get()` every second.
2. Preload turns that into `ipcRenderer.invoke("active-app:get")`.
3. The main process handles `active-app:get`.
4. The main process talks to a long-lived Swift helper process.
5. The Swift helper prints JSON back.
6. The main process returns that data to React.

From [`electron/preload.ts`](../electron/preload.ts):

```ts
const activeApp = {
  get: () =>
    ipcRenderer.invoke("active-app:get") as Promise<{
      title: string;
      ownerName: string;
    }>
};
```

From [`electron/main.ts`](../electron/main.ts):

```ts
ipcMain.handle("active-app:get", async () => {
  const info = await getActiveAppInfo();
  return { title: info.title, ownerName: info.ownerName };
});
```

The main process then talks to the Swift binary through standard input and output. That native helper lives in [`native/active-window.swift`](../native/active-window.swift).

This is a good example of why the renderer should not directly own native work. The renderer just wants app/window info. The main process knows how to get it.

## Why the renderer does not import Electron directly here

This repo follows the safer Electron pattern:

- the renderer uses `window.electronAPI`
- preload owns `ipcRenderer`
- the main process owns `ipcMain`

That separation keeps the React code closer to normal frontend code.

If you moved raw Electron calls into React components, you would create a few problems:

- more security exposure
- more repeated IPC channel strings across the app
- tighter coupling between UI code and native implementation details
- harder testing and maintenance

Preload gives you one translation layer instead of many ad-hoc ones.

## Why the app-level API names are useful

Compare these two styles.

### Lower-level style

```ts
ipcRenderer.invoke("sessions:list", { page: 1, pageSize: 20 });
```

### App-level style used by this repo

```ts
window.electronAPI.sessions.list({ page: 1, pageSize: 20 });
```

The second style is better for the renderer because it reads like an app API, not a transport protocol.

That is another reason preload exists.

It lets the renderer think in terms of actions like:

- open the settings window
- read config
- list sessions
- export sessions

instead of thinking in terms of:

- channel names
- event wiring
- Electron transport details

## Common pitfalls and non-goals

### Pitfall: thinking preload is just boilerplate

It can look like a thin wrapper, but it is an architectural boundary.

Its job is not only to forward calls. Its job is also to decide what the page is allowed to do.

### Pitfall: treating the main process like a web server

The main process is the closest thing to a backend here, but it is still local desktop code.

It is not a remote service. It runs on the user's machine.

### Pitfall: sending the wrong kinds of values over IPC

IPC can serialize many common JavaScript values, but not every browser object makes sense on the main-process side.

For example, DOM-specific objects do not belong in main-process code.

In this repo, the IPC payloads are kept fairly simple:

- strings
- booleans
- numbers
- plain objects
- arrays of plain objects

### Non-goal: letting the renderer do everything

Electron could be configured in less strict ways, but this repo is clearly built around the idea that native work should stay outside the React layer.

That is the correct mental model for maintaining it.

## Suggested reading order

Start with the repo files first, then read the official docs.

### Repo files

1. [`electron/main.ts`](../electron/main.ts)
2. [`electron/preload.ts`](../electron/preload.ts)
3. [`src/lib/hooks/app-hooks.ts`](../src/lib/hooks/app-hooks.ts)
4. [`src/lib/hooks/session-hooks.ts`](../src/lib/hooks/session-hooks.ts)
5. [`electron/session-store.ts`](../electron/session-store.ts)
6. [`native/active-window.swift`](../native/active-window.swift)
7. [`learnings/active-window-detection.md`](./active-window-detection.md)
8. [`learnings/swift-binary-in-electron.md`](./swift-binary-in-electron.md)

### Official Electron docs

1. [Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)
2. [Using Preload Scripts](https://www.electronjs.org/docs/latest/tutorial/tutorial-preload)
3. [Inter-Process Communication](https://www.electronjs.org/docs/latest/tutorial/ipc)
4. [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
5. [contextBridge API](https://www.electronjs.org/docs/latest/api/context-bridge)
6. [ipcRenderer API](https://www.electronjs.org/docs/latest/api/ipc-renderer)

## Final takeaway

When you work on this app, think in three layers:

1. **Renderer**: React components and hooks decide what the UI needs.
2. **Preload**: `window.electronAPI` defines the allowed bridge.
3. **Main**: Electron does the real desktop work.

If you are tracing a feature, follow this order:

1. Find where React calls `window.electronAPI...`
2. Find the matching method in `electron/preload.ts`
3. Find the matching `ipcMain.handle(...)` or `ipcMain.on(...)` in `electron/main.ts`
4. Follow what the main process does next

That pattern explains almost every renderer-to-backend interaction in this repo.
