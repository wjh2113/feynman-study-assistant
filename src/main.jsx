import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App.jsx";
import { bootstrapNativeShell } from "./native/bootstrap.js";
import "./styles.css";

bootstrapNativeShell().catch(() => {});

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    window.setInterval(() => {
      registration.update().catch(() => {});
    }, 60 * 60 * 1000);
  }
});

createRoot(document.getElementById("root")).render(<App />);
