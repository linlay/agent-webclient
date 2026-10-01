import type { AgentCreationOptionsResponse, AgentCreationTypeOption } from "@/shared/data";
import {
  buildProjectCreateRequest,
  changeProjectCreationType,
  initialProjectCreationSelection,
  projectCreationProblem,
  resolveProjectCreationModel,
  selectableProjectCreationGroups,
  setProjectCreationGroups,
} from "@/features/agents/lib/projectCreation";

function nativeType(
  key: AgentCreationTypeOption["key"],
  overrides: Partial<AgentCreationTypeOption> = {},
): AgentCreationTypeOption {
  return {
    key,
    label: key,
    mode: key.toUpperCase(),
    engine: "native",
    available: true,
    workspaceRequired: true,
    modelRequired: true,
    defaultModelKey: "default-model",
    defaultModelAvailable: true,
    supportsGroups: true,
    baseTools: [],
    defaultGroups: [],
    ...overrides,
  };
}

function creationOptions(): AgentCreationOptionsResponse {
  const group = (key: string, available = true) => ({
    key,
    name: key,
    skills: [],
    tools: [],
    connectors: [],
    available,
  });
  return {
    types: [
      nativeType("general", { defaultGroups: ["office", "web-data"] }),
      nativeType("coder", { defaultGroups: ["web-data"] }),
      nativeType("kbase", { defaultModelKey: "", defaultModelAvailable: false }),
      {
        key: "acp",
        label: "External",
        mode: "CODER",
        engine: "acp",
        available: true,
        workspaceRequired: true,
        modelRequired: false,
        defaultModelAvailable: false,
        supportsGroups: false,
        baseTools: [],
        defaultGroups: [],
        acpBridges: [{ id: "claude" }, { id: "codex" }],
      },
    ],
    groups: [group("office"), group("web-data"), group("automation"), group("broken", false)],
    models: [{ key: "default-model" }, { key: "other-model" }],
  };
}

describe("projectCreation", () => {
  it("starts on the first available type with its default groups", () => {
    const options = creationOptions();
    const selection = initialProjectCreationSelection(options);
    expect(selection).toMatchObject({
      typeKey: "general",
      groups: ["office", "web-data"],
      groupsTouched: false,
    });
    expect(selectableProjectCreationGroups(options, "general").map((g) => g.key)).toEqual([
      "office",
      "web-data",
      "automation",
    ]);
    expect(selectableProjectCreationGroups(options, "acp")).toEqual([]);
  });

  it("applies type defaults until the user edits the groups, then keeps the edit", () => {
    const options = creationOptions();
    let selection = initialProjectCreationSelection(options);
    selection = changeProjectCreationType(options, selection, "coder");
    expect(selection.groups).toEqual(["web-data"]);
    selection = changeProjectCreationType(options, selection, "kbase");
    expect(selection.groups).toEqual([]);
    selection = changeProjectCreationType(options, selection, "general");
    expect(selection.groups).toEqual(["office", "web-data"]);

    selection = setProjectCreationGroups(options, selection, ["automation", "web-data", "broken"]);
    expect(selection.groups).toEqual(["web-data", "automation"]);
    expect(changeProjectCreationType(options, selection, "coder").groups).toEqual([
      "web-data",
      "automation",
    ]);

    // Deselecting everything is a valid choice that survives a type switch.
    const empty = setProjectCreationGroups(options, selection, []);
    expect(changeProjectCreationType(options, empty, "general").groups).toEqual([]);
  });

  it("requires an explicit model when the type default is unusable", () => {
    const options = creationOptions();
    let selection = changeProjectCreationType(
      options,
      initialProjectCreationSelection(options),
      "kbase",
    );
    expect(resolveProjectCreationModel(options, selection)).toBe("");
    expect(projectCreationProblem(options, selection, "/project")).toBe("modelRequired");

    selection = { ...selection, modelKey: "other-model" };
    expect(projectCreationProblem(options, selection, "/project")).toBeNull();
    expect(buildProjectCreateRequest(options, selection, " /project ", " Docs ")).toEqual({
      definition: {
        name: "Docs",
        mode: "KBASE",
        runtimeConfig: { workspaceRoot: "/project" },
        modelConfig: { modelKey: "other-model" },
      },
      capabilityGroups: [],
    });
    expect(resolveProjectCreationModel(options, { ...selection, modelKey: "ghost" })).toBe("");
  });

  it("sends groups for native types and only the bridge for the external engine", () => {
    const options = creationOptions();
    const general = initialProjectCreationSelection(options);
    expect(buildProjectCreateRequest(options, general, "/project")).toEqual({
      definition: { mode: "GENERAL", runtimeConfig: { workspaceRoot: "/project" } },
      capabilityGroups: ["office", "web-data"],
    });
    expect(projectCreationProblem(options, general, "  ")).toBe("directoryRequired");

    const acp = changeProjectCreationType(options, { ...general, modelKey: "other-model" }, "acp");
    expect(acp.acpBridgeId).toBe("claude");
    expect(buildProjectCreateRequest(options, { ...acp, acpBridgeId: "codex" }, "/project")).toEqual({
      definition: {
        mode: "CODER",
        engine: "acp",
        runtimeConfig: { workspaceRoot: "/project", acpBridgeId: "codex" },
      },
      capabilityGroups: [],
    });
    expect(projectCreationProblem(options, { ...acp, acpBridgeId: "" }, "/project")).toBe(
      "acpBridgeRequired",
    );
    options.types[3].available = false;
    expect(projectCreationProblem(options, acp, "/project")).toBe("typeUnavailable");
  });
});
