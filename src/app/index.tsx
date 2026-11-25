import React from "react";
import { installRenderDiagnosticInteractions } from "@/shared/utils/renderDiagnostics";
import { createRoot } from "react-dom/client";
import App from "@/app/App";
import { WebClientRenderErrorBoundary } from "@/app/WebClientRenderError";
import { installOverlayScrollbars } from "@/shared/ui/overlayScrollbars";
import "@/shared/styles/globals.css";
import "@/shared/styles/overlayScrollbars.css";
import "katex/dist/katex.min.css";
import { configureApplicationDataRequestExecutor } from "@/app/bootstrap/configureDataRequestExecutor";

installRenderDiagnosticInteractions();
configureApplicationDataRequestExecutor();

try {
	installOverlayScrollbars();
} catch (error) {
	console.error("Failed to install overlay scrollbars", error);
}

const container = document.getElementById("root");
if (!container) {
	throw new Error("Root element #root not found");
}

const root = createRoot(container);
root.render(
	<React.StrictMode>
		<WebClientRenderErrorBoundary>
			<App />
		</WebClientRenderErrorBoundary>
	</React.StrictMode>,
);
