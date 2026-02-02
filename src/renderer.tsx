import React from "react";
import { createRoot } from "react-dom/client";
import { ConfigWindow } from "@/components/ConfigWindow";
import { TimerWindow } from "@/components/TimerWindow";
import "./styles/globals.css";

const App = () => {
  const isConfigWindow =
    new URLSearchParams(window.location.search).get("window") === "config";
  return isConfigWindow ? <ConfigWindow /> : <TimerWindow />;
};

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
