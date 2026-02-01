import { app, BrowserWindow, ipcMain } from "electron";
import { execFile } from "node:child_process";
import path from "node:path";
import started from "electron-squirrel-startup";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const getActiveAppName = () =>
  new Promise<string>((resolve) => {
    if (process.platform !== "darwin") {
      resolve("");
      return;
    }
    execFile(
      "osascript",
      [
        "-e",
        'tell application "System Events"',
        "set frontApp to first application process whose frontmost is true",
        "set frontAppFile to file of frontApp",
        "set frontAppNameFallback to name of frontApp",
        "end tell",
        "set frontAppPath to POSIX path of frontAppFile",
        'set frontAppName to ""',
        "try",
        'set frontAppName to do shell script "mdls -name kMDItemDisplayName -raw " & quoted form of frontAppPath',
        "end try",
        'if frontAppName is "" or frontAppName is "(null)" then set frontAppName to frontAppNameFallback',
        "return frontAppName",
      ],
      (error, stdout) => {
        if (error) {
          resolve("");
          return;
        }
        resolve(stdout.trim());
      },
    );
  });

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 360,
    height: 480,
    minWidth: 360,
    minHeight: 480,
    maxWidth: 360,
    maxHeight: 480,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

ipcMain.handle("always-on-top:get", () => {
  return mainWindow?.isAlwaysOnTop() ?? false;
});

ipcMain.handle("always-on-top:set", (_event, value: boolean) => {
  if (!mainWindow) return false;
  mainWindow.setAlwaysOnTop(Boolean(value), "floating");
  return mainWindow.isAlwaysOnTop();
});

ipcMain.handle("active-app:get", async () => {
  return getActiveAppName();
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
