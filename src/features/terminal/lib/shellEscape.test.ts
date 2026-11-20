import {
  detectShellDialect,
  escapeShellPath,
  formatDroppedPathsForShell,
} from "./shellEscape";

describe("shellEscape", () => {
  it("detects shell dialect from executable path", () => {
    expect(detectShellDialect("/bin/zsh")).toBe("posix");
    expect(detectShellDialect("/opt/homebrew/bin/bash")).toBe("posix");
    expect(detectShellDialect("C:\\Program Files\\Git\\usr\\bin\\bash.exe")).toBe("posix");
    expect(detectShellDialect("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe("powershell");
    expect(detectShellDialect("powershell.exe")).toBe("powershell");
    expect(detectShellDialect("C:\\Windows\\System32\\cmd.exe")).toBe("cmd");
    expect(detectShellDialect("")).toBe("posix");
  });

  it("escapes paths for posix shells and strips control injection characters", () => {
    expect(escapeShellPath("/Users/cc/repo/app.ts", "posix")).toBe("/Users/cc/repo/app.ts");
    expect(escapeShellPath("/Users/cc/my docs/测试 file.txt", "posix")).toBe(
      "'/Users/cc/my docs/测试 file.txt'",
    );
    expect(escapeShellPath("/tmp/it's a file.sh", "posix")).toBe("'/tmp/it'\\''s a file.sh'");
    expect(escapeShellPath("/tmp/bad\nrm -rf /\0", "posix")).toBe("'/tmp/badrm -rf /'");
    expect(
      escapeShellPath("C:\\My Docs\\sub\\file.txt", "posix", { windowsPosixPath: true }),
    ).toBe("'C:/My Docs/sub/file.txt'");
  });

  it("escapes paths for PowerShell and CMD", () => {
    expect(escapeShellPath("C:\\repo\\app.ts", "powershell")).toBe("C:\\repo\\app.ts");
    expect(escapeShellPath("C:\\My Docs\\it's.ps1", "powershell")).toBe(
      "'C:\\My Docs\\it''s.ps1'",
    );

    expect(escapeShellPath("C:\\repo\\app.ts", "cmd")).toBe("C:\\repo\\app.ts");
    expect(escapeShellPath("C:\\My Docs\\a&b.txt", "cmd")).toBe('"C:\\My Docs\\a&b.txt"');
    expect(escapeShellPath('C:\\My Docs\\"q".txt', "cmd")).toBe('"C:\\My Docs\\\\"q\\".txt"');
    expect(escapeShellPath("C:\\bad\r\necho pwned", "cmd")).toBe('"C:\\badecho pwned"');
  });

  it("formats multiple dropped paths joined by single space per shell", () => {
    expect(
      formatDroppedPathsForShell(
        ["/repo/a.ts", "/repo/my file.ts"],
        "/bin/zsh",
      ),
    ).toBe("/repo/a.ts '/repo/my file.ts'");

    expect(
      formatDroppedPathsForShell(
        ["C:\\repo\\a.ts", "C:\\My Docs\\b.ts"],
        "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
      ),
    ).toBe("C:/repo/a.ts 'C:/My Docs/b.ts'");

    expect(
      formatDroppedPathsForShell(
        ["C:\\repo\\a.ts", "C:\\My Docs\\it's.txt"],
        "pwsh.exe",
      ),
    ).toBe("C:\\repo\\a.ts 'C:\\My Docs\\it''s.txt'");
  });
});
