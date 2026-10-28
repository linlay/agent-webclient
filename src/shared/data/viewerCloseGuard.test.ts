import { confirmViewerClose, registerViewerCloseGuard } from "./viewerCloseGuard";

describe("viewer close guard", () => {
  it("asks the registered viewer before closing and cleans up", () => {
    expect(confirmViewerClose("viewer:a")).toBe(true);
    const unregister = registerViewerCloseGuard("viewer:a", () => false);
    expect(confirmViewerClose("viewer:a")).toBe(false);
    expect(confirmViewerClose("viewer:b")).toBe(true);
    unregister();
    expect(confirmViewerClose("viewer:a")).toBe(true);
  });

  it("ignores empty keys", () => {
    const unregister = registerViewerCloseGuard("", () => false);
    expect(confirmViewerClose("")).toBe(true);
    unregister();
  });
});
