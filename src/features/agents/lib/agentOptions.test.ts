import { withAgentToolBindings } from "./agentOptions";

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
