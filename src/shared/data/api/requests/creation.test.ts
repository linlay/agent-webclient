/** @jest-environment jsdom */
import { loadAgentCreationOptions } from "./creation";
import { getAdminAgentCreationDefaults } from "./agents";
import { requestJson } from "../http";
import { getDesktopCreationOptions } from "../../desktop/desktopCreationOptions";
jest.mock("./agents",()=>({getAdminAgentCreationDefaults:jest.fn()}));
jest.mock("../http",()=>({requestJson:jest.fn()}));
jest.mock("../../desktop/desktopCreationOptions",()=>({getDesktopCreationOptions:jest.fn()}));
beforeEach(()=>jest.resetAllMocks());
it("embedded client uses host profile without requesting standalone data",async()=>{
 const options={types:[],groups:[],models:[]};
 jest.mocked(getDesktopCreationOptions).mockReturnValue(Promise.resolve(options));
 expect(await loadAgentCreationOptions()).toBe(options);
 expect(getAdminAgentCreationDefaults).not.toHaveBeenCalled();
});
it("does not substitute standalone configuration when host fails",async()=>{
 jest.mocked(getDesktopCreationOptions).mockReturnValue(Promise.reject(new Error("host unavailable")));
 await expect(loadAgentCreationOptions()).rejects.toThrow("host unavailable");
 expect(getAdminAgentCreationDefaults).not.toHaveBeenCalled();
});
it("standalone loads its own profile and filters unavailable skills",async()=>{
 jest.mocked(getDesktopCreationOptions).mockReturnValue(null);
 jest.mocked(getAdminAgentCreationDefaults).mockResolvedValue({data:{types:[{key:"general",engine:"native",baseTools:[]}],models:[]}} as any);
 jest.mocked(requestJson).mockImplementation(async(path:any)=>({data:path.endsWith("skills")?{skills:[{id:"docs",status:"invalid"}]}:path.endsWith("connectors")?{connectors:[]}:[]}) as any);
 global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({version:1,types:{general:{defaultGroups:["office"]}},groups:[{key:"office",name:"Office",skills:["docs"]}]})});
 const result=await loadAgentCreationOptions();
 expect(result.groups[0].available).toBe(false);
 expect(result.types[0].defaultGroups).toEqual([]);
 expect(String(jest.mocked(fetch).mock.calls[0][0])).toMatch(/\/agent-creation.json$/);
});
