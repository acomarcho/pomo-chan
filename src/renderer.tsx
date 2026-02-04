import React from "react";
import { createRoot } from "react-dom/client";
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
      <App />
      <Toaster />
    </React.StrictMode>,
  );
}
