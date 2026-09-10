import React from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { AppProvider } from "@/app/state/AppContext";
import { AppearanceProvider } from "@/features/appearance/components/AppearanceProvider";
import { DESKTOP_SKINS } from "@/features/appearance/lib/skins";
import { applyBootAppearance } from "@/shared/styles/appearance/bootstrap";
import { AGENT_WEBCLIENT_APPEARANCE_COLOR_TOKENS } from "@/shared/contracts/generated/agentWebclientBridge";
import { I18nProvider } from "@/shared/i18n";
import { AgentsPage } from "@/app/pages/agents";
import { SkillsPage } from "@/app/pages/skills";
import { ConnectorsPage } from "@/app/pages/connectors";
import { RegistriesPage } from "@/app/pages/registries";
import { ArchivesPage } from "@/app/pages/archives";
import "@/shared/styles/globals.css";
import "@/app/layout/ManagementPages.module.css";
import "@/features/command-center/components/CommandSurface.module.css";

// Isolated fixture entry: no business backend, no production bridge changes.
globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { DESKTOP_APP: true };
applyBootAppearance();
let revision = 0;
let current: any;
const listeners = new Set<(value: any) => void>();
function appearance(mode = "light", skinId = "mist", background = "host") {
  const skin = DESKTOP_SKINS.find(skin => skin.id === skinId)!;
  const tokens = Object.fromEntries(Object.entries(skin.tokens[mode as "light" | "dark"]).filter(([key]) => (AGENT_WEBCLIENT_APPEARANCE_COLOR_TOKENS as readonly string[]).includes(key)));
  current = { schemaVersion: 1, revision: ++revision, resolvedTheme: mode, skinId, tokens, background: { mode: background } };
  listeners.forEach(listener => listener(current));
}
Object.defineProperty(window, "__AGENT_WEBCLIENT_APPEARANCE__", { value: { version: 1, getSnapshot: async () => current, subscribe: (fn: any) => { listeners.add(fn); return () => listeners.delete(fn); } } });
appearance();
window.addEventListener("message", event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.type !== "qa-appearance") return;
  appearance(event.data.mode, event.data.skin, event.data.background);
});
const page = new URLSearchParams(location.search).get("page") || "registries";
const router = createMemoryRouter([
  { path: "/agents/:agentKey?", element: <AgentsPage /> },
  { path: "/skills/:skillKey?", element: <SkillsPage /> },
  { path: "/connectors/:connectorId?", element: <ConnectorsPage /> },
  { path: "/registries", element: <RegistriesPage /> },
  { path: "/archives/:chatId?", element: <ArchivesPage /> },
], { initialEntries: [page === "agents" ? "/agents/demo" : page === "skills" ? "/skills/demo" : page === "connectors" ? "/connectors/demo" : page === "archives" ? "/archives/demo" : `/${page}`] });
createRoot(document.getElementById("root")!).render(<I18nProvider locale="zh-CN"><AppearanceProvider><AppProvider><RouterProvider router={router} /></AppProvider></AppearanceProvider></I18nProvider>);
