import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const rootNode = document.getElementById("root")!;
createRoot(rootNode).render(
  <StrictMode>
    <App />
  </StrictMode>
);

const bootScreen = document.getElementById("app-boot");
if (bootScreen) {
  requestAnimationFrame(() => {
    bootScreen.classList.add("boot-hide");
    window.setTimeout(() => bootScreen.remove(), 220);
  });
}
