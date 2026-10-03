import { getMemoryFile, saveMemoryFile, deleteMemoryFile, getMemoryDates, searchMemoryFiles } from "./memory";
import { setupRequestHarness } from "@/shared/data/__testUtils__/requestHarness";
describe("Markdown file protocol",()=>{
 const {fetchMock}=setupRequestHarness();
 it("uses only logical targets and versioned mutations",async()=>{
  const document={kind:"owner" as const,content:"# Owner",revision:"revision-1",exists:true};
  await getMemoryFile("owner");await saveMemoryFile(document);await deleteMemoryFile(document);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/memory/file?kind=owner&date=");
  expect(fetchMock.mock.calls[1][1].method).toBe("PUT");expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({kind:"owner",content:"# Owner",revision:"revision-1"});
  expect(fetchMock.mock.calls[2][1].method).toBe("DELETE");expect(JSON.parse(String(fetchMock.mock.calls[2][1].body))).toEqual({kind:"owner",revision:"revision-1"});
 });
 it("passes date cursors for bounded literal lookup",async()=>{await getMemoryDates("2026-10-03");await searchMemoryFiles("中文","2026-10-03");expect(fetchMock.mock.calls[0][0]).toBe("/api/memory/daily?before=2026-10-03");expect(fetchMock.mock.calls[1][0]).toBe("/api/memory/search?query=%E4%B8%AD%E6%96%87&before=2026-10-03");});
});
