import {
  normalizeGreetings,
  normalizeWonders,
  pickRandomGreeting,
  pickRandomWonders,
} from "@/features/composer/lib/wonders";

describe("wonders", () => {
  it("normalizes and keeps multiline wonder text", () => {
    expect(
      normalizeWonders([
        "  帮我演示提问式确认  ",
        "帮我演示 Bash HITL 审批确认\n并说明下一步会看到什么",
        "",
        "   ",
        null,
      ]),
    ).toEqual([
      "帮我演示提问式确认",
      "帮我演示 Bash HITL 审批确认\n并说明下一步会看到什么",
    ]);
  });

  it("picks at most the requested number of unique wonders", () => {
    const wonders = ["A", "B", "C", "D"];

    expect(
      pickRandomWonders(wonders, 3, () => 0),
    ).toEqual(["B", "C", "D"]);
  });

  it("returns all wonders when there are fewer than the limit", () => {
    expect(
      pickRandomWonders(["A", "B"], 3, () => 0.5),
    ).toEqual(["A", "B"]);
  });

  it("normalizes greetings and keeps multiline placeholder text", () => {
    expect(
      normalizeGreetings([
        "  我可以帮你拆解问题  ",
        "我可以帮你制定计划\n并确认下一步",
        "",
        null,
      ]),
    ).toEqual([
      "我可以帮你拆解问题",
      "我可以帮你制定计划\n并确认下一步",
    ]);
  });

  it("picks one random greeting", () => {
    expect(pickRandomGreeting(["A", "B", "C"], () => 0.67)).toBe("C");
  });
});
