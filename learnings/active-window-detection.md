# How Active Window Detection Works (and What Went Wrong)

## Background: What is Pomo-chan doing?

Pomo-chan is a pomodoro timer that tracks which app you're using during focus sessions. To do this, it needs to ask macOS "what app is the user looking at right now?" every second.

## The Old Approach (get-windows)

We used an npm package called `get-windows`. Under the hood, this package works by running a small program (a "binary" — a compiled file that macOS can execute directly, like an .app but without a GUI). Every time we wanted to know the active window, we'd:

1. Start the binary as a new process
2. Wait for it to print the answer (JSON) to its output
3. Read the output
4. The binary exits and the process dies

This happened **every 1 second**. That's 3,600 new processes per hour.

### What are "processes"?

When you run a program on your computer, the operating system creates a "process" for it — a container with its own memory, permissions, and lifecycle. Opening Chrome is a process. Running `node server.js` is a process. Each time we called `get-windows`, macOS had to create a new process, run the program, and clean up after it.

## What Went Wrong: macOS Permissions (TCC)

### What is TCC?

macOS has a privacy system called **TCC** (Transparency, Consent, and Control). It's what shows you those "App X wants to access your screen" popups. TCC controls which apps can:

- Read your screen content (Screen Recording permission)
- Control other apps (Accessibility permission)
- Access your camera, microphone, etc.

TCC is managed by a background service called `tccd` (the TCC daemon — a "daemon" is a program that runs in the background).

### The Problem

The `get-windows` binary checked permissions on **every single startup**. Before doing any actual work, it would ask macOS: "Do I have permission?" If macOS said no, it would exit with an error.

So every second, we were:

1. Spawning a new process
2. That process asks `tccd`: "Do I have Accessibility permission?"
3. That process asks `tccd`: "Do I have Screen Recording permission?"
4. Only then does it actually check the active window

After running for hours (thousands of permission checks), `tccd` would start intermittently returning "no" even though the permission was still granted in System Settings. The result: the active app badge would flicker between working and showing "Unknown", then eventually fail completely.

### Why restarting didn't always fix it

The stale TCC state is system-wide — it's not tied to our app's process. So quitting and reopening Pomo-chan would still hit the same stale cache. The only fix was going to System Settings → Privacy & Security → Accessibility, removing the app, and re-adding it. This forced `tccd` to create a fresh permission entry.

### Why it worked fine from the terminal

We tested running the binary directly from the terminal — it worked perfectly, even while the app was broken. That's because terminal and Electron are different parent processes with different TCC contexts. The staleness was specific to how the binary's permission was being evaluated when spawned from Electron.

### The binary was ad-hoc signed

Another contributing factor: the binary had an "ad-hoc signature" — basically a self-signed identity with no real developer certificate. TCC ties permissions to a combination of (file path + code signature). With ad-hoc signing, this identity is fragile and harder for macOS to verify reliably across thousands of rapid invocations.

## The New Approach: Long-Lived Process

Instead of spawning a new process every second, we wrote a small Swift program (44 lines) that:

1. **Starts once** and stays alive for the entire app session
2. **Waits for input** — when it receives a newline character (`\n`) on stdin, it checks the active window
3. **Prints the result** as one line of JSON to stdout
4. **Repeats** until the app quits

### How Electron talks to it

```
Electron                          Swift binary
   |                                  |
   |--- writes "\n" to stdin -------->|
   |                                  | (checks NSWorkspace.frontmostApplication)
   |                                  | (checks CGWindowListCopyWindowInfo)
   |<-- prints JSON to stdout --------|
   |                                  |
   | (1 second later...)              |
   |--- writes "\n" to stdin -------->|
   |<-- prints JSON to stdout --------|
```

### What is stdin/stdout?

Every process has three standard "pipes":

- **stdin** (standard input) — where a process reads input from
- **stdout** (standard output) — where a process writes its output
- **stderr** (standard error) — where a process writes error messages

When you type in a terminal, you're writing to stdin. When a program prints something, it's writing to stdout. We use these pipes to communicate between Electron and the Swift binary.

### Why this fixes the problem

|                                | Old (get-windows)                          | New (long-lived process)       |
| ------------------------------ | ------------------------------------------ | ------------------------------ |
| Processes created per hour     | 3,600                                      | 1                              |
| TCC permission checks per hour | 7,200 (2 per process)                      | 0                              |
| How it communicates            | spawn process → read output → process dies | write to pipe → read from pipe |
| Can TCC go stale?              | Yes, after thousands of checks             | No checks happen at all        |

The TCC permission is evaluated once — when the binary first accesses `CGWindowListCopyWindowInfo`. After that, macOS remembers the grant for the lifetime of the process. Since our process never dies (until the app quits), TCC is never re-checked.

## Swift Gotcha: The Run Loop

One tricky thing we hit: `NSWorkspace.shared.frontmostApplication` (the macOS API that tells you which app is in front) needs a **run loop** to stay up to date.

### What is a run loop?

A run loop is a loop that macOS GUI programs use to receive events — mouse clicks, keyboard input, app switches, etc. Without a run loop, `NSWorkspace` never hears about app switches, so `frontmostApplication` returns whatever app was in front when the process started.

Our first attempt used a simple `while readLine() { ... }` loop. This blocked the main thread, preventing the run loop from running. The fix was to read stdin on a background thread and keep the main run loop alive:

```swift
// Background thread: read stdin
DispatchQueue.global().async {
    while let _ = readLine() {
        // ... check active window and print result
    }
}

// Main thread: keep the run loop alive for NSWorkspace
RunLoop.main.run()
```

## File Locations

- **Swift source**: `native/active-window.swift`
- **Compiled binary**: `native/active-window` (not committed — built by `npm run build:native`)
- **Electron integration**: `electron/main.ts` (the `spawnActiveWindowProc` and `getActiveWindowNative` functions)
- **App logs**: `~/.pomo-chan/logs/app.log`
