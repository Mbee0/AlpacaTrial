import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

const rootNode = document.getElementById("root")!;
createRoot(rootNode).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);

const bootScreen = document.getElementById("app-boot");
if (bootScreen) {
  requestAnimationFrame(() => {
    bootScreen.classList.add("boot-hide");
    window.setTimeout(() => bootScreen.remove(), 220);
  });
}
