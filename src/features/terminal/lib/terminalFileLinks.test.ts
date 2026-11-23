import {
  parseTerminalFileLinks,
  resolveTerminalLinkPath,
} from "./terminalFileLinks";

describe("terminalFileLinks", () => {
  it("parses file:line:col, parenthesized compiler locations, and Python traceback links", () => {
    expect(parseTerminalFileLinks("ERROR in src/app/index.tsx:42:10 - type mismatch")).toEqual([
      {
        path: "src/app/index.tsx",
        line: 42,
        col: 10,
        startIndex: 9,
        endIndex: 32,
        rawText: "src/app/index.tsx:42:10",
      },
    ]);

    expect(parseTerminalFileLinks("./cmd/main.go:18: syntax error")).toEqual([
      {
        path: "./cmd/main.go",
        line: 18,
        startIndex: 0,
        endIndex: 16,
        rawText: "./cmd/main.go:18",
      },
    ]);

    expect(parseTerminalFileLinks("at C:\\repo\\src\\app.ts:15:4")).toEqual([
      {
        path: "C:\\repo\\src\\app.ts",
        line: 15,
        col: 4,
        startIndex: 3,
        endIndex: 26,
        rawText: "C:\\repo\\src\\app.ts:15:4",
      },
    ]);

    expect(parseTerminalFileLinks("src/app.ts(10,3): error TS1005")).toEqual([
      {
        path: "src/app.ts",
        line: 10,
        col: 3,
        startIndex: 0,
        endIndex: 16,
        rawText: "src/app.ts(10,3)",
      },
    ]);

    expect(parseTerminalFileLinks('  File "/repo/a.py", line 18, in <module>')).toEqual([
      {
        path: "/repo/a.py",
        line: 18,
        startIndex: 7,
        endIndex: 28,
        rawText: '"/repo/a.py", line 18',
      },
    ]);
  });

  it("ignores URLs, timestamps, and zero line numbers", () => {
    expect(parseTerminalFileLinks("Listening at http://127.0.0.1:3000/api")).toEqual([]);
    expect(parseTerminalFileLinks("See https://example.com:8080/docs:12:4")).toEqual([]);
    expect(parseTerminalFileLinks("12:34:56 INFO server ready")).toEqual([]);
    expect(parseTerminalFileLinks("src/app.ts:0:1")).toEqual([]);
  });

  it("normalizes relative and workspace-contained paths against current cwd and workspace root", () => {
    expect(
      resolveTerminalLinkPath("./foo.ts", "/repo/sub", "/repo"),
    ).toBe("sub/foo.ts");

    expect(
      resolveTerminalLinkPath("../shared/util.ts", "/repo/packages/app", "/repo"),
    ).toBe("packages/shared/util.ts");

    expect(
      resolveTerminalLinkPath("/repo/src/main.ts", "/repo/sub", "/repo"),
    ).toBe("src/main.ts");

    expect(
      resolveTerminalLinkPath("C:\\Repo\\src\\main.ts", "C:\\Repo\\sub", "c:\\repo"),
    ).toBe("src/main.ts");

    expect(
      resolveTerminalLinkPath("/opt/external/lib.ts", "/repo", "/repo"),
    ).toBe("/opt/external/lib.ts");
  });
});
