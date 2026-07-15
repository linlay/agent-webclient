import {
  buildCopyAllText,
  compactCopyInfoRows,
  createCopyInfoRow,
  stringifyCopyInfoValue,
} from "@/shared/ui/copyInfoModel";

describe("copyInfoModel", () => {
  it("formats primitive arrays as readable text and objects as pretty JSON", () => {
    expect(stringifyCopyInfoValue(["search", "shell"])).toBe("search, shell");
    expect(stringifyCopyInfoValue({ enabled: true })).toBe(
      '{\n  "enabled": true\n}',
    );
  });

  it("filters empty values and builds label-value copy text", () => {
    const rows = compactCopyInfoRows([
      createCopyInfoRow("id", "Agent ID", "agent-a"),
      createCopyInfoRow("empty", "Empty", "   "),
      createCopyInfoRow("tools", "Tools", ["search", "shell"]),
    ]);

    expect(rows).toHaveLength(2);
    expect(buildCopyAllText([{ key: "basic", label: "Basic", rows }])).toBe(
      "Agent ID: agent-a\nTools: search, shell",
    );
  });
});
