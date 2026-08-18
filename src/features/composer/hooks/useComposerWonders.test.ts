import { shouldLoadComposerAgentDetails } from "@/features/composer/hooks/useComposerWonders";

describe("useComposerWonders", () => {
  it("loads agent details only for a blank conversation with a selected agent", () => {
    expect(shouldLoadComposerAgentDetails("zenmi", true)).toBe(true);
    expect(shouldLoadComposerAgentDetails("zenmi", false)).toBe(false);
    expect(shouldLoadComposerAgentDetails("", true)).toBe(false);
  });
});
