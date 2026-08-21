import type { TimelineSourceChunk } from "@/app/state/types";
import { resolveInitialSourceChunkId } from "@/app/layout/sidebar/right/SourceDetailTab";

jest.mock("@/shared/ui/MarkdownContent", () => ({
  MarkdownContent: () => null,
}));

describe("SourceDetailContent", () => {
  const chunks = [
    { chunkId: "chunk_1", index: 1, content: "one" },
    { chunkId: "chunk_2", index: 2, content: "two" },
  ] as TimelineSourceChunk[];

  it("selects a valid route chunk and falls back to the first chunk", () => {
    expect(resolveInitialSourceChunkId(chunks, "chunk_2")).toBe("chunk_2");
    expect(resolveInitialSourceChunkId(chunks, "missing")).toBe("chunk_1");
    expect(resolveInitialSourceChunkId([], "chunk_2")).toBe("");
  });
});
