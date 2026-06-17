import { resolveAwaitingResolutionNoticeKey } from "@/features/tools/components/buildin/useResolvedByOtherNotice";

describe("resolveAwaitingResolutionNoticeKey", () => {
  it("prefers timeout copy for timeout resolution", () => {
    expect(
      resolveAwaitingResolutionNoticeKey({
        resolvedByOther: true,
        resolutionReason: "timeout",
      }),
    ).toBe("approvalDialog.timeoutResolved");
  });

  it("keeps remote answered copy for remote resolution and legacy state", () => {
    expect(
      resolveAwaitingResolutionNoticeKey({
        resolutionReason: "remote_answered",
      }),
    ).toBe("approvalDialog.resolvedByOther");

    expect(
      resolveAwaitingResolutionNoticeKey({
        resolvedByOther: true,
      }),
    ).toBe("approvalDialog.resolvedByOther");
  });
});
