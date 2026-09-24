import {fallbackDefinition, formFromDetail} from "./agentDefinition";
import type {AgentDetailResponse} from "@/shared/data/api/dto/agents";

it("maps runtime skill objects to editor skill keys and NONE to disabled reasoning", () => {
 const detail: AgentDetailResponse = {key:"cutej",name:"小君",mode:"REACT",modelKey:"model-a",reasoningEffort:"NONE",tools:[],skills:[{key:"platform-admin",name:"平台管理"}],controls:[],meta:{}};
 const definition = fallbackDefinition(detail);
 expect(definition.skillConfig).toEqual({skills:["platform-admin"]});
 expect(definition.modelConfig).toEqual({modelKey:"model-a",reasoning:{enabled:false}});
 expect(formFromDetail(detail)).toMatchObject({modelKey:"model-a",reasoningEnabled:false,skills:["platform-admin"]});
});
