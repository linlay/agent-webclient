import { resolveInitialLocale } from "@/shared/i18n/runtime";
import { getAdminAgentCreationDefaults } from "./agents";
import { requestJson } from "../http";
import { applyCreationProfile, parseCreationProfile, type CreationCatalog } from "@/shared/creation/creation-profile";
import { getDesktopCreationOptions } from "../../desktop/desktopCreationOptions";
import type { AgentCreationOptionsResponse } from "../dto/agents";

export async function loadAgentCreationOptions(): Promise<AgentCreationOptionsResponse> {
  const desktop = getDesktopCreationOptions();
  if (desktop) return desktop;
  const [runtime, profileResponse, skills, connectors, tools] = await Promise.all([
    getAdminAgentCreationDefaults(), fetch(new URL("/agent-creation.json", window.location.origin), { cache: "no-store" }),
    requestJson<{skills: Array<CreationCatalog["skills"][number] & {status: string}>}>("/api/admin/skills", {cache: "no-store"}),
    requestJson<{connectors: CreationCatalog["connectors"]}>("/api/admin/connectors", {cache: "no-store"}),
    requestJson<CreationCatalog["tools"]>("/api/admin/tools", {cache: "no-store"}),
  ]);
  if (!profileResponse.ok) throw new Error("Cannot load agent-creation.json");
  return applyCreationProfile(runtime.data, parseCreationProfile(await profileResponse.json()), {
    skills: skills.data.skills.filter(s => s.status === "ready"), connectors: connectors.data.connectors, tools: tools.data,
  }, resolveInitialLocale());
}
