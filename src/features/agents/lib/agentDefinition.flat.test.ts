import {fallbackDefinition, formFromDetail} from "./agentDefinition";
import type {AgentDetailResponse} from "@/shared/data/api/dto/agents";

it("maps runtime skill objects to editor skill IDs and NONE to disabled reasoning", () => {
 const detail: AgentDetailResponse = {key:"cutej",name:"小君",mode:"REACT",modelKey:"model-a",reasoningEffort:"NONE",tools:[],skills:[{id:"platform-admin",name:"平台管理"}],controls:[],meta:{}};
 const definition = fallbackDefinition(detail);
 expect(definition.skillConfig).toEqual({skills:["platform-admin"]});
 expect(definition.modelConfig).toEqual({modelKey:"model-a",reasoning:{enabled:false}});
 expect(formFromDetail(detail)).toMatchObject({modelKey:"model-a",reasoningEnabled:false,skills:["platform-admin"]});
});

 it("does not copy effective presets into an empty Agent declaration", () => {
 const detail: AgentDetailResponse = {key:"demo",name:"demo",mode:"GENERAL",tools:["datetime"],skills:[],controls:[],meta:{},definition:{key:"demo",mode:"GENERAL",toolConfig:{excludeTools:["sleep"]}},toolBindings:[{name:"datetime",source:"preset",removable:false,excluded:false,active:true}]};
 expect(formFromDetail(detail).tools).toEqual([]);
 });
