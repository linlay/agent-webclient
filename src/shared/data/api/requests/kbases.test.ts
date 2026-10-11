import { deleteKBase, readKBase, saveKBase, searchKBase } from "./kbases";
import { requestJson } from "../http";
jest.mock("../http", () => ({ requestJson: jest.fn(() => Promise.resolve({ code: 0 })) }));
beforeEach(() => jest.clearAllMocks());
it("keeps document references in encoded query parameters", () => {
 readKBase("library", "kbx://workspace/a & b.md");
 expect(requestJson).toHaveBeenCalledWith("/api/admin/kbases/library/read?ref=kbx%3A%2F%2Fworkspace%2Fa%20%26%20b.md", { signal: undefined });
});
it("uses explicit HTTP mutations and search JSON", () => {
 saveKBase({ name: "Docs", description: "notes", collections: [{ name: "docs", sourcePath: "/docs" }, { name: "reports", sourcePath: "/reports" }] });
 expect(requestJson).toHaveBeenLastCalledWith("/api/admin/kbases", expect.objectContaining({ method: "POST" }));
 saveKBase({ name: "Renamed", description: "", baseRevision: "read-revision" }, "library");
 expect(requestJson).toHaveBeenLastCalledWith("/api/admin/kbases/library", expect.objectContaining({ method: "PUT", body: '{"name":"Renamed","description":"","baseRevision":"read-revision"}' }));
 searchKBase("library", "hello", 5);
 expect(requestJson).toHaveBeenLastCalledWith("/api/admin/kbases/library/search", expect.objectContaining({ body: '{"query":"hello","limit":5,"method":"query"}' }));
 searchKBase("library", "hello", 5, undefined, ["docs", "reports"], "vsearch");
 expect(requestJson).toHaveBeenLastCalledWith("/api/admin/kbases/library/search", expect.objectContaining({ body: '{"query":"hello","limit":5,"collections":["docs","reports"],"method":"vsearch"}' }));
 deleteKBase("library", "revision & value");
 expect(requestJson).toHaveBeenLastCalledWith("/api/admin/kbases/library?baseRevision=revision%20%26%20value", { method: "DELETE" });
});

it("keeps the usage catalog distinct from admin and preserves published library/source identity", async () => {
 const {getKBaseOptionsHttp, readPublishedKnowledge} = await import("./kbases");
 await getKBaseOptionsHttp("target agent");
 expect(requestJson).toHaveBeenLastCalledWith("/api/kbases?agentKey=target%20agent", {signal: undefined, cache: "no-store"});
 readPublishedKnowledge("chat", "kbase:lib-b/docs/same.md", 0);
 expect(requestJson).toHaveBeenLastCalledWith("/api/chat/sources/read", expect.objectContaining({body: JSON.stringify({chatId: "chat", sourceId: "kbase:lib-b/docs/same.md", offset: 0, limit: 200})}));
});
