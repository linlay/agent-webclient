import { removeEmptyMarkdownTables } from "@/shared/ui/markdownPreprocess";

describe("removeEmptyMarkdownTables", () => {
  it("removes a markdown table that only has an Issues header row", () => {
    const markdown = ["Before", "", "| Issues |", "| --- |", "", "After"].join(
      "\n",
    );

    expect(removeEmptyMarkdownTables(markdown)).toBe(
      ["Before", "", "", "After"].join("\n"),
    );
  });

  it("keeps markdown tables with body rows", () => {
    const markdown = [
      "| Issues |",
      "| --- |",
      "| Missing status |",
      "",
      "After",
    ].join("\n");

    expect(removeEmptyMarkdownTables(markdown)).toBe(markdown);
  });

  it("keeps table-like text inside fenced code blocks", () => {
    const markdown = ["```md", "| Issues |", "| --- |", "```"].join("\n");

    expect(removeEmptyMarkdownTables(markdown)).toBe(markdown);
  });
});
