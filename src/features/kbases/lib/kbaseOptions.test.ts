import {loadKBaseOptions, parseKBaseOptions, unavailableKbaseIds} from "./kbaseOptions";
import {getAgent, getKBaseOptions} from "@/shared/data";
jest.mock("@/shared/data", () => ({getAgent: jest.fn(), getKBaseOptions: jest.fn()}));
const catalog = {agentKey: "general", capability: {available: true}, boundLibraryId: "fixed", libraries: [
 {id: "old-index", name: "Readable", collections: [], readable: true, indexing: true, degraded: true},
 {id: "new-index", name: "Not readable", collections: [], readable: false, indexing: true, degraded: false},
]};
beforeEach(() => jest.clearAllMocks());
it("defers availability to the backend even while indexing or degraded", () => {
 const parsed = parseKBaseOptions(catalog, "general");
 expect(unavailableKbaseIds(parsed, ["old-index", "new-index", "deleted"])).toEqual(["new-index", "deleted"]);
 expect(unavailableKbaseIds({...parsed, capability: {available: false}}, ["old-index"])).toEqual(["old-index"]);
});
it.each([undefined, false])("does not advertise an absent or disabled interaction flag (%s)", async flag => {
 (getAgent as jest.Mock).mockResolvedValue({data: {interactionConfig: {mustUseKbases: flag}}});
 await expect(loadKBaseOptions("general")).rejects.toThrow("kbase.disabled");
 expect(getKBaseOptions).not.toHaveBeenCalled();
});
it("loads a usage catalog for the actual target Agent and rejects a mismatched/old response", async () => {
 (getAgent as jest.Mock).mockResolvedValue({data: {interactionConfig: {mustUseKbases: true}}});
 (getKBaseOptions as jest.Mock).mockResolvedValue({data: catalog});
 await expect(loadKBaseOptions("general")).resolves.toEqual(catalog);
 expect(getKBaseOptions).toHaveBeenCalledWith("general", undefined);
 expect(() => parseKBaseOptions(catalog, "other")).toThrow("kbase.protocolUnavailable");
 expect(() => parseKBaseOptions([], "general")).toThrow("kbase.protocolUnavailable");
});
