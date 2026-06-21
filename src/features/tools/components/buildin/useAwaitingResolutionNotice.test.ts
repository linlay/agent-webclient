import { resolveAwaitingResolutionNoticeKey } from "@/features/tools/components/buildin/useAwaitingResolutionNotice";

describe("resolveAwaitingResolutionNoticeKey", () => {
  it("prefers timeout copy for timeout resolution", () => {
    expect(
      resolveAwaitingResolutionNoticeKey({
        resolutionReason: "timeout",
      }),
    ).toBe("approvalDialog.timeoutResolved");
  });

  it("keeps remote answered copy for remote resolution", () => {
    expect(
      resolveAwaitingResolutionNoticeKey({
        resolutionReason: "remote_answered",
      }),
    ).toBe("approvalDialog.remoteAnswered");
  });
});
