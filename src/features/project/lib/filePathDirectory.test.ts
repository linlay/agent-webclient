import { parentDirectory } from "./filePathDirectory";

describe("parentDirectory", () => {
  it("splits POSIX paths", () => {
    expect(parentDirectory("/Users/like/ws/src/App.tsx")).toBe("/Users/like/ws/src");
    expect(parentDirectory("src/features/project/FileDiffView.tsx")).toBe("src/features/project");
  });

  it("splits Windows native paths", () => {
    expect(parentDirectory("C:\\Users\\me\\ws\\src\\App.tsx")).toBe("C:\\Users\\me\\ws\\src");
    expect(parentDirectory("D:/ws/src/App.tsx")).toBe("D:/ws/src");
  });

  it("keeps the separator on Windows drive roots", () => {
    expect(parentDirectory("C:\\App.tsx")).toBe("C:\\");
    expect(parentDirectory("C:/App.tsx")).toBe("C:/");
  });

  it("keeps UNC share directories intact", () => {
    expect(parentDirectory("\\\\server\\share\\App.tsx")).toBe("\\\\server\\share");
  });

  it("returns an empty string when there is no directory part", () => {
    expect(parentDirectory("")).toBe("");
    expect(parentDirectory("App.tsx")).toBe("");
    expect(parentDirectory("/App.tsx")).toBe("");
    expect(parentDirectory("\\App.tsx")).toBe("");
  });
});
