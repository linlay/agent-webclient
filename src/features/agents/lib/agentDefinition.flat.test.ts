import {fallbackDefinition, formFromDetail} from "./agentDefinition";
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
