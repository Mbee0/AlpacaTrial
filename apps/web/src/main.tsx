import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing root mount element.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);

const bootOverlay = document.getElementById("app-boot");
if (bootOverlay) {
  window.requestAnimationFrame(() => {
    bootOverlay.classList.add("is-hidden");
    window.setTimeout(() => {
      bootOverlay.remove();
    }, 420);
  });
}
