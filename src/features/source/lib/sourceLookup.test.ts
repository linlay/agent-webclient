import {findSourceById} from "./sourceLookup";
it("distinguishes the same document/chunk IDs in two published libraries", () => {
 const source = (libraryId: string) => ({id: "same.md", libraryId, chunks: [{chunkId: "same-chunk", content: libraryId}]});
 const nodes = [{kind: "source", sources: [source("a"), source("b")]}] as never;
 expect(findSourceById(nodes, "same.md", "b")?.chunks[0].content).toBe("b");
 expect(findSourceById(nodes, "same.md", "missing")).toBeNull();
});
