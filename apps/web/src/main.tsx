import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyAppIdentity } from "./app-identity";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { installDiagramLinkGuard } from "./render/diagram-link-guard";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root was not found");

applyAppIdentity();
installDiagramLinkGuard();

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
