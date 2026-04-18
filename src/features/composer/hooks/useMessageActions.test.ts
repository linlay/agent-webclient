import { resolveQueryStreamExecutor } from "@/features/composer/hooks/useMessageActions";
import { executeQueryStreamSse } from "@/features/transport/lib/queryStreamRuntime.sse";
import { executeQueryStreamWs } from "@/features/transport/lib/queryStreamRuntime.ws";

jest.mock("@/features/transport/lib/queryStreamRuntime.sse", () => ({
  executeQueryStreamSse: jest.fn(),
}));

jest.mock("@/features/transport/lib/queryStreamRuntime.ws", () => ({
  executeQueryStreamWs: jest.fn(),
}));

describe("resolveQueryStreamExecutor", () => {
  it("returns the sse executor for sse mode", () => {
    expect(resolveQueryStreamExecutor("sse")).toBe(executeQueryStreamSse);
  });

  it("returns the ws executor for ws mode", () => {
    expect(resolveQueryStreamExecutor("ws")).toBe(executeQueryStreamWs);
  });
});
