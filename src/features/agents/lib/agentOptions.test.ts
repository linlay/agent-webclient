import { withAgentToolBindings, projectAgentTools } from "./agentOptions";

it.each([null, undefined, []])("handles absent tool bindings (%p)", (bindings) => {
 const options = [{key:"bash",label:"Bash",kind:"",sourceCategory:""}];
 expect(withAgentToolBindings(options, bindings)).toEqual(options);
 expect(withAgentToolBindings([], bindings)).toEqual([]);
});

it("adds excluded presets to display without mutating the editable tool list", () => {
 const options = [{key:"bash",label:"Bash",kind:"",sourceCategory:""}];
 const projected = withAgentToolBindings(options, [{name:"sleep",source:"preset",removable:false,excluded:true,active:false}]);
 expect(projected.map(tool => tool.key)).toEqual(["bash","sleep"]);
 expect(projected[1].binding).toMatchObject({removable:false,excluded:true});
 expect(options).toHaveLength(1);
 expect(withAgentToolBindings(projected, [{name:"sleep",source:"preset",removable:false,excluded:false,active:true}])).toHaveLength(2);
});

it("groups connector tools separately while preserving declarations and shared runtime dependencies", () => {
 const declared = ["chat_query", "mcp_docs", "custom", "missing"];
 const result = projectAgentTools([
  {key:"chat_query",label:"Chats",sourceCategory:"platform",kind:"builtin"},
  {key:"mcp_docs",label:"Docs",sourceCategory:"mcp",kind:"mcp"},
  {key:"custom",label:"Custom",sourceCategory:"external",kind:"cli"},
 ], [
  {name:"chat_query",source:"connector",removable:false,active:true,excluded:false},
  {name:"bash",source:"connector",removable:false,active:true,excluded:false},
  {name:"datetime",source:"preset",removable:false,active:false,excluded:true},
 ], declared, ["chat_query"]);
 expect(result.available.map(tool => tool.key)).toEqual(["custom", "bash", "datetime"]);
 expect(result.selected.map(tool => tool.key)).toEqual(["bash", "datetime", "custom", "missing"]);
 expect(result.selected[1].binding).toMatchObject({excluded:true,active:false});
 expect(declared).toEqual(["chat_query", "mcp_docs", "custom", "missing"]);
});
