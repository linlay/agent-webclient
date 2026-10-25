import {fallbackDefinition, formFromDetail, buildDefinition, createEmptyAgentForm} from "./agentDefinition";
import type {AgentDetailResponse} from "@/shared/data/api/dto/agents";

it("maps runtime skill IDs to editor skill IDs and NONE to disabled reasoning", () => {
 const detail: AgentDetailResponse = {key:"cutej",name:"小君",mode:"REACT",modelKey:"model-a",reasoningEffort:"NONE",tools:[],skills:["platform-admin"],connectors:[],controls:[],meta:{}};
 const definition = fallbackDefinition(detail);
 expect(definition.skillConfig).toEqual({skills:["platform-admin"]});
 expect(definition.modelConfig).toEqual({modelKey:"model-a",reasoning:{enabled:false}});
 expect(formFromDetail(detail)).toMatchObject({modelKey:"model-a",reasoningEnabled:false,skills:["platform-admin"]});
});

 it("does not copy effective presets into an empty Agent declaration", () => {
 const detail: AgentDetailResponse = {key:"demo",name:"demo",mode:"GENERAL",tools:["datetime"],skills:[],connectors:[],controls:[],meta:{},definition:{key:"demo",mode:"GENERAL",toolConfig:{excludeTools:["sleep"]}}};
 expect(formFromDetail(detail).tools).toEqual([]);
 });

it("edits management detail without a redundant tools array", () => {
 const detail = { key: "demo", name: "Demo", mode: "GENERAL", status: "ready", toolBindings: [
  { name: "datetime", source: "preset", removable: false, active: true, excluded: false },
  { name: "file_read", source: "agent", removable: true, active: true, excluded: false },
 ], definition: { key: "demo", toolConfig: { tools: ["file_read"], excludeTools: ["bash"] } } };
 expect(formFromDetail(detail).tools).toEqual(["file_read"]);
});

 it("round-trips one library binding independently of Workspace and supports unbinding", () => {
 const definition = { key: "docs", mode: "GENERAL", kbaseConfig: { libraryId: "research", retrieval: { topK: 9 } }, runtimeConfig: { workspaceRoot: "/work" } };
 const detail: AgentDetailResponse = {key:"docs",name:"Docs",mode:"GENERAL",tools:[],skills:[],connectors:[],controls:[],meta:{},definition};
 const form = formFromDetail(detail);
 const translate = ((key: string) => key) as Parameters<typeof buildDefinition>[2];
 expect(buildDefinition(form, definition, translate).kbaseConfig).toEqual(definition.kbaseConfig);
 form.kbaseConfigText = "";
 expect(buildDefinition(form, definition, translate)).not.toHaveProperty("kbaseConfig");
 });


it("preserves explicit entry overrides and leaves unset defaults out of the YAML", () => {
  const definition = {key: "demo", mode: "KBASE", interactionConfig: {
    showPlanningMode: false, showEditingMode: false, showTerminal: true,
  }};
  const detail: AgentDetailResponse = {key: "demo", name: "Demo", mode: "KBASE", tools: [], skills: [], connectors: [], controls: [], meta: {}, definition};
  const form = formFromDetail(detail);
  const translate = ((key: string) => key) as Parameters<typeof buildDefinition>[2];
  expect(buildDefinition(form, definition, translate).interactionConfig).toEqual(definition.interactionConfig);
  form.interactionConfig = {showEditingMode: true};
  expect(buildDefinition(form, definition, translate).interactionConfig).toEqual({showEditingMode: true});
  form.interactionConfig = undefined;
  expect(buildDefinition(form, definition, translate)).not.toHaveProperty("interactionConfig");
});

it("edits only source connector declarations and round-trips additions and the last removal", () => {
 const definition = { key: "demo", connectorConfig: { connectors: ["docs"] }, toolConfig: { tools: ["file_read"], excludeTools: ["bash"] } };
 const detail = { key: "demo", name: "Demo", status: "ready", definition, connectorBindings: [
  { id: "web", source: "preset" as const, active: true },
  { id: "docs", source: "agent" as const, active: false },
  { id: "old", source: "agent" as const, active: true, pendingRemoval: true },
 ] };
 const form = formFromDetail(detail);
 const translate = (key: string) => key;
 expect(form.connectors).toEqual(["docs"]);
 form.connectors = ["docs", " builtin.httpx ", "docs"];
 const saved = buildDefinition(form, definition, translate);
 expect(saved.connectorConfig).toEqual({ connectors: ["docs", "builtin.httpx"] });
 expect(saved.toolConfig).toEqual(definition.toolConfig);
 expect(definition.connectorConfig.connectors).toEqual(["docs"]);
 form.connectors = [];
 expect(buildDefinition(form, definition, translate).connectorConfig).toEqual({ connectors: [] });
});

it("supports connector selections during creation and leaves effective presets out of declarations", () => {
 const translate = (key: string) => key;
 const form = createEmptyAgentForm();
 expect(buildDefinition(form, {}, translate)).not.toHaveProperty("connectorConfig");
 form.connectors = ["docs"];
 expect(buildDefinition(form, {}, translate).connectorConfig).toEqual({ connectors: ["docs"] });
 const detail = { key: "demo", name: "Demo", status: "ready", definition: { key: "demo" }, connectorBindings: [{ id: "web", source: "preset" as const, active: true }] };
 expect(formFromDetail(detail).connectors).toEqual([]);
});

it("persists only the explicit detail override and supports restoring mode inheritance", () => {
 const definition = {key:"demo", mode:"CODER"};
 const detail = {key:"demo",name:"Demo",definition,interactionConfig:{defaultDetail:"full"},status:"ready"};
 const form = formFromDetail(detail as Parameters<typeof formFromDetail>[0]);
 const translate = ((key:string) => key) as Parameters<typeof buildDefinition>[2];
 expect(buildDefinition(form,definition,translate)).not.toHaveProperty("interactionConfig");
 form.interactionConfig = {defaultDetail:"summary",showTerminal:false};
 expect(buildDefinition(form,definition,translate).interactionConfig).toEqual({defaultDetail:"summary",showTerminal:false});
 delete form.interactionConfig.defaultDetail;
 expect(buildDefinition(form,definition,translate).interactionConfig).toEqual({showTerminal:false});
});
