import { deleteKBase, readKBase, saveKBase, searchKBase } from "./kbases";
import { requestJson } from "../http";
jest.mock("../http", () => ({ requestJson: jest.fn(() => Promise.resolve({ code: 0 })) }));
beforeEach(() => jest.clearAllMocks());
it("keeps document references in encoded query parameters", () => {
 readKBase("library", "kbx://workspace/a & b.md");
 expect(requestJson).toHaveBeenCalledWith("/api/admin/kbases/library/read?ref=kbx%3A%2F%2Fworkspace%2Fa%20%26%20b.md", { signal: undefined });
});
it("uses explicit HTTP mutations and search JSON", () => {
 saveKBase({ name: "Docs", description: "notes", sourcePath: "/docs" });
 expect(requestJson).toHaveBeenLastCalledWith("/api/admin/kbases", expect.objectContaining({ method: "POST" }));
 saveKBase({ name: "Renamed", description: "" }, "library");
 expect(requestJson).toHaveBeenLastCalledWith("/api/admin/kbases/library", expect.objectContaining({ method: "PUT" }));
 searchKBase("library", "hello", 5);
 expect(requestJson).toHaveBeenLastCalledWith("/api/admin/kbases/library/search", expect.objectContaining({ body: '{"query":"hello","limit":5}' }));
 deleteKBase("library");
 expect(requestJson).toHaveBeenLastCalledWith("/api/admin/kbases/library", { method: "DELETE" });
});
