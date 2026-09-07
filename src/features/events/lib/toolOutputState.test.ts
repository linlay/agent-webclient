import {
  appendToolOutputChunk,
  TOOL_OUTPUT_MAX_BYTES,
  TOOL_OUTPUT_TRUNCATION_MARKER,
  toolOutputText,
} from "@/features/events/lib/toolOutputState";

describe("tool output state", () => {
  it("merges adjacent streams and ignores duplicate or older chunks", () => {
    const first = appendToolOutputChunk(undefined, {
      stream: "stdout",
      delta: "one",
      chunkIndex: 0,
    });
    const second = appendToolOutputChunk(first, {
      stream: "stdout",
      delta: " two",
      chunkIndex: 1,
    });
    const third = appendToolOutputChunk(second, {
      stream: "stderr",
      delta: "warn",
      chunkIndex: 2,
    });

    expect(third.segments).toEqual([
      { stream: "stdout", text: "one two" },
      { stream: "stderr", text: "warn" },
    ]);
    expect(appendToolOutputChunk(third, {
      stream: "stdout",
      delta: "duplicate",
      chunkIndex: 2,
    })).toBe(third);
    expect(appendToolOutputChunk(third, {
      stream: "stdout",
      delta: "older",
      chunkIndex: 1,
    })).toBe(third);
  });

  it("caps retained UTF-8 output at 1 MiB while preserving head and tail", () => {
    const head = "HEAD:" + "你".repeat(220_000);
    const tail = "TAIL:" + "x".repeat(600_000);
    const state = appendToolOutputChunk(undefined, {
      stream: "stdout",
      delta: head + tail,
      chunkIndex: 0,
    });
    const text = toolOutputText(state);

    expect(state.truncated).toBe(true);
    expect(text.startsWith("HEAD:")).toBe(true);
    expect(text.endsWith("x".repeat(100))).toBe(true);
    expect(text).toContain(TOOL_OUTPUT_TRUNCATION_MARKER);
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(
      TOOL_OUTPUT_MAX_BYTES,
    );

    const appended = appendToolOutputChunk(state, {
      stream: "stderr",
      delta: "\nFINAL ERROR",
      chunkIndex: 1,
    });
    const appendedText = toolOutputText(appended);
    expect(appendedText.startsWith("HEAD:")).toBe(true);
    expect(appendedText.endsWith("FINAL ERROR")).toBe(true);
    expect(
      appended.segments.filter((segment) => segment.truncationMarker),
    ).toHaveLength(1);
    expect(new TextEncoder().encode(appendedText).byteLength).toBeLessThanOrEqual(
      TOOL_OUTPUT_MAX_BYTES,
    );
  });
});
