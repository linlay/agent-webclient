import React from "react";
import { createRoot } from "react-dom/client";
import App from "@/app/App";
import "@/shared/styles/globals.css";
import "katex/dist/katex.min.css";

const container = document.getElementById("root");
if (!container) {
	throw new Error("Root element #root not found");
}

const root = createRoot(container);
root.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
