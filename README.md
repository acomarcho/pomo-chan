# pomo-chan

Pomodoro timer with Live2D companion.

## Development

```bash
npm run dev
```

Starts Vite dev server with Electron. Hot reload enabled for all processes.

## Build

```bash
npm run build
```

Builds the app for production (outputs to `dist/` and `dist-electron/`).

## Run Production Build

```bash
npm run start
```

Runs the built app locally (requires `npm run build` first).

## Package

```bash
npm run package
```

Packages the app without creating installer (outputs to `release/`).

## Distribute

```bash
npm run make
```

Creates distributable installers (DMG, ZIP on macOS; NSIS, portable on Windows; AppImage, deb on Linux).

## Other Commands

- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Run TypeScript type checking
