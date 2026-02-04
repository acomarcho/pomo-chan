import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { ConfigWindow } from "@/components/ConfigWindow";
import { HistoryWindow } from "@/components/HistoryWindow";
import { TimerWindow } from "@/components/TimerWindow";
import { Toaster } from "@/components/ui/sonner";
import "./styles/globals.css";

const App = () => {
  const windowType = new URLSearchParams(window.location.search).get("window");
  if (windowType === "config") {
    return <ConfigWindow />;
  }
  if (windowType === "history") {
    return <HistoryWindow />;
  }
  return <TimerWindow />;
};

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <App />
        <Toaster />
      </ThemeProvider>
    </React.StrictMode>,
  );
}
