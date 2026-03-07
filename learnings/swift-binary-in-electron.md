# Compiling and Using a Swift Binary in an Electron App

## What is a "binary"?

When you write JavaScript, Node.js reads your code and runs it line by line. But languages like Swift, C, and Rust work differently — you run a **compiler** that translates your source code into a file that your computer's CPU can execute directly. This compiled file is called a **binary** (or "executable"). It doesn't need Node, Python, or any runtime — macOS runs it natively.

Think of it like the difference between a recipe (source code) and a pre-made frozen meal (binary). The recipe needs a chef (runtime) to turn it into food. The frozen meal just needs a microwave (your CPU).

## Why would you want a binary in an Electron app?

Electron apps are built with web technologies (HTML, CSS, JavaScript), but sometimes you need to do things that JavaScript can't do — like asking macOS "which app is the user looking at right now?" These macOS-specific APIs are written in Swift or Objective-C, so you need native code to call them.

You have two options:

1. **Native Node addon** (a `.node` file) — compiled C/C++ code that loads directly into Node.js. More complex to build, needs to match Electron's exact version.
2. **Standalone binary** — a separate executable that your Electron app talks to. Simpler to build, runs independently.

We chose option 2.

## How to compile a Swift binary

### Prerequisites

You need Xcode Command Line Tools installed. If you're on a Mac and have ever run `git` or `xcode-select --install`, you probably have them. You can verify with:

```sh
swift --version
```

### Compiling

Our source file is `native/active-window.swift`. To compile it:

```sh
swiftc -O -o native/active-window native/active-window.swift
```

Breaking this down:

- `swiftc` — the Swift compiler
- `-O` — optimize the output (makes it faster and smaller)
- `-o native/active-window` — where to put the compiled binary
- `native/active-window.swift` — the source file

This produces a single file (`native/active-window`) that macOS can run directly. No dependencies, no runtime needed.

### Testing it

You can run the binary directly from your terminal:

```sh
echo "" | ./native/active-window
```

It will print a JSON status line, then a JSON line with the active window info.

## How Electron finds and runs the binary

### Development mode (`npm run dev`)

In dev mode, Electron knows its own source directory via `app.getAppPath()`. The binary path is:

```ts
path.join(app.getAppPath(), "native", "active-window");
// → /Users/you/Desktop/pomo-chan/native/active-window
```

### Packaged mode (the built .app)

When you build the app with `electron-builder`, it bundles everything into a `.app` package. But the binary isn't part of your JavaScript bundle — it's a separate native file. So we tell electron-builder to copy it into the app's **resources** folder using `extraResources` in `package.json`:

```json
{
  "build": {
    "extraResources": [
      {
        "from": "native/active-window",
        "to": "active-window"
      }
    ]
  }
}
```

This copies `native/active-window` into the app at `Contents/Resources/active-window`. In code, Electron finds it with:

```ts
path.join(process.resourcesPath, "active-window");
// → /Applications/pomo-chan.app/Contents/Resources/active-window
```

### The full path logic

```ts
const activeWindowBinary = app.isPackaged
  ? path.join(process.resourcesPath, "active-window") // packaged .app
  : path.join(app.getAppPath(), "native", "active-window"); // dev mode
```

`app.isPackaged` is a boolean that Electron sets — `true` when running from a built `.app`, `false` during `npm run dev`.

## How Electron communicates with the binary

### The old way (bad)

Spawn a new process every time, wait for output, process dies:

```ts
// This ran every 1 second — 3,600 process spawns per hour
const { stdout } = await execFile("./binary");
const result = JSON.parse(stdout);
```

### The new way (good)

Spawn the process once, keep it alive, communicate through pipes:

```ts
// Spawn once on app startup
const proc = spawn("./binary");

// To get data: write a newline, read a line back
proc.stdin.write("\n");
readline.once("line", (data) => {
  const result = JSON.parse(data);
});
```

### What are pipes?

When you create a child process with `spawn`, Node.js sets up three **pipes** — communication channels between your app and the child process:

- `proc.stdin` — you write to this, the binary reads from it
- `proc.stdout` — the binary writes to this, you read from it
- `proc.stderr` — the binary writes errors here

Pipes are like a two-way walkie-talkie. Your Electron app says "give me the active window" by writing `\n` to stdin. The binary responds with a JSON line on stdout. This is just data flowing through memory — no files, no network, no new processes.

## How the build pipeline works

### Build scripts in package.json

```json
{
  "scripts": {
    "build:native": "swiftc -O -o native/active-window native/active-window.swift",
    "package": "npm run build:native && npm run build && electron-builder --dir",
    "make": "npm run build:native && npm run build && electron-builder"
  }
}
```

The flow when you run `npm run make`:

1. `build:native` — compiles the Swift source into a binary
2. `build` — compiles TypeScript and bundles the web app with Vite
3. `electron-builder` — packages everything into a `.app`, copying the binary via `extraResources`

### What's in .gitignore

The compiled binary (`native/active-window`) is **not committed to git** — only the source file (`native/active-window.swift`) is. Anyone who clones the repo needs to run `npm run build:native` to compile it. This is similar to how you don't commit `node_modules` — you regenerate it with `npm install`.

```gitignore
# Compiled native binaries (rebuild with: npm run build:native)
native/active-window
```

## Things to watch out for

### Architecture

The binary is compiled for whatever Mac you're on. If you compile on an Apple Silicon Mac (M1/M2/M3), it produces an `arm64` binary. If someone needs to run it on an Intel Mac, you'd need to compile a **universal binary** that contains both architectures:

```sh
swiftc -O -o native/active-window-arm64 native/active-window.swift --target arm64-apple-macos11
swiftc -O -o native/active-window-x86 native/active-window.swift --target x86_64-apple-macos11
lipo -create -output native/active-window native/active-window-arm64 native/active-window-x86
```

For now we only target arm64 since this is a personal project.

### Code signing

When macOS runs a binary, it checks its **code signature** — a cryptographic stamp that verifies who made it and that it hasn't been tampered with. When you compile with `swiftc`, the binary gets an **ad-hoc signature** (basically "I trust myself"). This works fine for local development and personal builds, but if you ever distribute the app to others, you'd need to sign it with an Apple Developer certificate.

### macOS permissions

The binary needs **Screen Recording** permission to read window titles (`kCGWindowName`). The app owner name (`NSWorkspace.frontmostApplication`) requires no permissions. Since the binary is spawned as a child of the Electron app, macOS may ask the user to grant permission to the Electron app (not the binary separately).

## File locations

| File                         | Purpose                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| `native/active-window.swift` | Swift source code (committed to git)                          |
| `native/active-window`       | Compiled binary (not in git, built by `npm run build:native`) |
| `electron/main.ts`           | Electron code that spawns and talks to the binary             |
| `package.json`               | Build scripts and `extraResources` config                     |
