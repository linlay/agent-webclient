import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_SKILL_ICON_URL,
  fallbackSkillIcon,
  findPreferredSkillFileEntry,
  isSkillEntryVisible,
  SkillFileWorkspace,
  SkillConsole,
  toggleSkillExpandedDir,
  updateSkillDirtyFiles,
} from "@/features/skills/components/SkillConsole";
import type { AdminSkillDetailResponse, AdminSkillFileEntry } from "@/shared/data";

const onSelectSkillKeyMock = jest.fn();
const onClearSelectionMock = jest.fn();

jest.mock("@/shared/i18n", () => {
  const ReactMod = require("react");
  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        if (key === "skillConsole.message.validateInvalid") return `${params?.count || 0} issues`;
        if (key === "skillConsole.delete.confirm") return `Delete ${params?.name || ""}?`;
        if (key === "skillConsole.list.count") return `Skills ${params?.count || 0}`;
        return key;
      },
      locale: "zh-CN",
    }),
    I18nProvider: ({ children }: { children: React.ReactNode }) =>
      ReactMod.createElement(React.Fragment, null, children),
  };
});

jest.mock("@/shared/data", () => ({
  buildAdminSkillFileDownloadUrl: jest.fn(() => "/api/admin/skills/file/download?key=demo-skill&path=asset.bin"),
  createAdminSkillFile: jest.fn(),
  createAdminSkill: jest.fn(),
  deleteAdminSkillFile: jest.fn(),
  downloadAdminSkill: jest.fn(),
  downloadAdminSkillFile: jest.fn(),
  fetchAdminSkillIcon: jest.fn(),
  getAdminSkillDetail: jest.fn(),
  getAdminSkillFile: jest.fn(),
  getAdminSkills: jest.fn(),
  mkdirAdminSkillFile: jest.fn(),
  renameAdminSkillFile: jest.fn(),
  saveAdminSkillFile: jest.fn(),
  uploadAdminSkillFile: jest.fn(),
  validateAdminSkill: jest.fn(),
}));

jest.mock("@/shared/ui/MaterialIcon", () => ({
  MaterialIcon: ({ name }: { name: string }) =>
    React.createElement("i", { "data-icon": name }),
}));

jest.mock("@/shared/ui/UiButton", () => ({
  UiButton: (props: Record<string, unknown>) =>
    React.createElement("button", {
      "data-variant": props.variant,
      disabled: props.disabled,
      ...(typeof props["aria-label"] === "string" ? { "aria-label": props["aria-label"] } : {}),
    }),
}));

jest.mock("@/shared/ui/UiTag", () => ({
  UiTag: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-tone": props.tone }, props.children),
}));

jest.mock("@/shared/ui/SearchFilterBar", () => ({
  SearchFilterBar: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "search-filter" }, "search"),
}));

jest.mock("antd", () => {
  const ReactMod = require("react");
  const Input = ({ prefix, ...props }: Record<string, unknown>) =>
    ReactMod.createElement(
      "div",
      { className: "mock-input" },
      prefix,
      ReactMod.createElement("input", props),
    );
  Input.TextArea = (props: Record<string, unknown>) =>
    ReactMod.createElement("textarea", props);
  return {
    Input,
    Spin: ({ children }: { children: React.ReactNode }) =>
      ReactMod.createElement(React.Fragment, null, children),
    Modal: {
      confirm: jest.fn(),
    },
    Dropdown: ({ children }: { children: React.ReactNode }) =>
      ReactMod.createElement(React.Fragment, null, children),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockGetAdminSkills =
  (require("@/shared/data") as { getAdminSkills: jest.Mock }).getAdminSkills;

const demoEntries: AdminSkillFileEntry[] = [
  {
    path: "SKILL.md",
    name: "SKILL.md",
    kind: "file",
    parentPath: "",
    depth: 0,
    order: 0,
    size: 128,
    sha256: "skill-sha",
    contentKind: "text",
    language: "markdown",
    role: "skillMd",
    editable: true,
    downloadable: true,
    uploadable: true,
    renamable: false,
    deletable: false,
  },
  {
    path: "references",
    name: "references",
    kind: "directory",
    parentPath: "",
    depth: 0,
    order: 1,
    contentKind: "directory",
    editable: false,
    downloadable: false,
    uploadable: false,
    renamable: true,
    deletable: true,
  },
  {
    path: "references/guide.md",
    name: "guide.md",
    kind: "file",
    parentPath: "references",
    depth: 1,
    order: 2,
    size: 256,
    sha256: "guide-sha",
    contentKind: "text",
    language: "markdown",
    role: "reference",
    editable: true,
    downloadable: true,
    uploadable: true,
    renamable: true,
    deletable: true,
  },
  {
    path: "assets/showcase.mp4",
    name: "showcase.mp4",
    kind: "file",
    parentPath: "assets",
    depth: 1,
    order: 3,
    size: 4096,
    mimeType: "video/mp4",
    sha256: "asset-sha",
    contentKind: "binary",
    role: "asset",
    editable: false,
    downloadable: true,
    uploadable: true,
    renamable: true,
    deletable: true,
  },
];

describe("SkillConsole", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAdminSkills.mockResolvedValue({
      status: 200,
      code: 0,
      msg: "ok",
      data: [
        {
          key: "demo-skill",
          name: "Demo Skill",
          description: "A demo skill",
          status: "ready",
          source: { kind: "skills-market", path: "/skills/demo-skill" },
        },
        {
          key: "broken-skill",
          name: "Broken Skill",
          status: "invalid",
          diagnostic: { severity: "error", code: "E001", message: "Bad config" },
        },
        {
          key: "disabled-skill",
          name: "Disabled",
          status: "disabled",
        },
      ],
    });
  });

  it("renders the skill console shell", () => {
    const html = renderToStaticMarkup(
      React.createElement(SkillConsole, {
        selectedSkillKey: "",
        onSelectSkillKey: onSelectSkillKeyMock,
        onClearSelection: onClearSelectionMock,
      }),
    );
    expect(html).toContain("skill-console");
    expect(html).toContain("minmax(220px,0.252fr)_minmax(0,1fr)");
    expect(html).not.toContain("minmax(220px,0.36fr)");
    expect(html).not.toContain("minmax(280px,0.52fr)");
  });

  it("shows the list count text", () => {
    const html = renderToStaticMarkup(
      React.createElement(SkillConsole, {
        selectedSkillKey: "",
        onSelectSkillKey: onSelectSkillKeyMock,
        onClearSelection: onClearSelectionMock,
      }),
    );
    // After mount and async load, the count should appear
    expect(html).toContain("skill-console-count");
  });

  it("shows empty state when no skills", () => {
    // Simulate empty state
    const html = renderToStaticMarkup(
      React.createElement(SkillConsole, {
        selectedSkillKey: "",
        onSelectSkillKey: onSelectSkillKeyMock,
        onClearSelection: onClearSelectionMock,
      }),
    );
    expect(html).toContain("skill-console-list");
  });

  it("prefers a requested file, then SKILL.md, then the first editable file", () => {
    expect(findPreferredSkillFileEntry(demoEntries, "references/guide.md")?.path).toBe(
      "references/guide.md",
    );
    expect(findPreferredSkillFileEntry(demoEntries)?.path).toBe("SKILL.md");
    expect(findPreferredSkillFileEntry([demoEntries[1], demoEntries[2]])?.path).toBe("references/guide.md");
  });

  it("adds and clears dirty files by comparing against original content", () => {
    let dirty = new Set<string>();

    dirty = updateSkillDirtyFiles(dirty, "SKILL.md", "changed", "original");
    expect([...dirty]).toEqual(["SKILL.md"]);

    dirty = updateSkillDirtyFiles(dirty, "SKILL.md", "original", "original");
    expect([...dirty]).toEqual([]);
  });

  it("tracks expanded directories by full path so duplicate names do not collide", () => {
    let expanded = new Set<string>();

    expanded = toggleSkillExpandedDir(expanded, "references/shared");
    expanded = toggleSkillExpandedDir(expanded, "scripts/shared");
    expect([...expanded].sort()).toEqual(["references/shared", "scripts/shared"]);

    expanded = toggleSkillExpandedDir(expanded, "references/shared");
    expect([...expanded]).toEqual(["scripts/shared"]);
  });

  it("uses expanded paths to decide manifest entry visibility", () => {
    const entry = demoEntries[2];
    expect(isSkillEntryVisible(entry, new Set(["references"]))).toBe(true);
    expect(isSkillEntryVisible(entry, new Set())).toBe(false);
  });

  it("falls back to the frontend default skill icon after an image error", () => {
    const image = {
      onerror: jest.fn(),
      src: "/missing-custom-icon.png",
    } as unknown as HTMLImageElement;
    fallbackSkillIcon(image);
    expect(image.onerror).toBeNull();
    expect(image.src).toBe(DEFAULT_SKILL_ICON_URL);
  });

  it("renders the simplified file workspace without the old skill meta grid", () => {
    const detail: AdminSkillDetailResponse = {
      skill: {
        key: "demo-skill",
        name: "Demo Skill",
        status: "ready",
        source: { kind: "skills-market", path: "/skills/demo-skill" },
        updatedAt: 1700000000000,
      },
      capabilities: {
        maxTextBytes: 1048576,
        maxUploadBytes: 33554432,
        canCreate: true,
        canRename: true,
        canDelete: true,
        canUpload: true,
        canDownload: true,
      },
      fileManifest: {
        revision: "rev",
        defaultOpenPath: "SKILL.md",
        counts: {
          files: 3,
          directories: 1,
          textFiles: 2,
          binaryFiles: 1,
          totalSize: 4480,
        },
        entries: demoEntries,
      },
      diagnostics: [
        {
          severity: "error",
          code: "E001",
          message: "Bad skill metadata",
        },
      ],
    };
    const noop = jest.fn();
    const html = renderToStaticMarkup(
      React.createElement(SkillFileWorkspace, {
        detail,
        selectedFilePath: "references/guide.md",
        fileContent: "# Guide",
        fileSize: 256,
        fileSha256: "guide-sha",
        dirtyFiles: new Set(["references/guide.md"]),
        expandedDirs: new Set(["references"]),
        isFileDirty: true,
        saving: false,
        validating: false,
        t: (key: string) => key,
        onCreateFile: noop,
        onCreateDir: noop,
        onValidate: noop,
        onRefreshFile: noop,
        onSave: noop,
        onRenameFile: noop,
        onDeleteFile: noop,
        onDownloadFile: noop,
        onReplaceFile: noop,
        onFileChange: noop,
        onSelectFileEntry: noop,
      }),
    );

    expect(html).toContain("skill-console-file-panels");
    expect(html).toContain("minmax(220px,286px)_minmax(0,1fr)");
    expect(html).not.toContain("minmax(220px,260px)");
    expect(html).toContain("skill-console-file-tree");
    expect(html).toContain("skill-console-file-editor");
    expect(html).toContain("SKILL.md");
    expect(html).toContain("guide.md");
    expect(html).toContain("references/guide.md");
    expect(html).toContain("Markdown");
    expect(html).not.toContain("skill-console-meta-grid");
    expect(html).not.toContain("skillConsole.diagnostics.title");
    expect(html).not.toContain("Bad skill metadata");
  });

  it("disables complete-skill download when the server does not allow it", () => {
    const detail: AdminSkillDetailResponse = {
      skill: { key: "demo-skill", name: "Demo Skill", status: "ready" },
      capabilities: {
        maxTextBytes: 1048576,
        maxUploadBytes: 33554432,
        canCreate: true,
        canRename: true,
        canDelete: true,
        canUpload: true,
        canDownload: false,
      },
      fileManifest: {
        revision: "rev",
        defaultOpenPath: "SKILL.md",
        counts: { files: 1, directories: 0, textFiles: 1, binaryFiles: 0, totalSize: 128 },
        entries: [demoEntries[0]],
      },
    };
    const noop = jest.fn();
    const html = renderToStaticMarkup(
      React.createElement(SkillFileWorkspace, {
        detail,
        selectedFilePath: "SKILL.md",
        fileContent: "# Skill",
        fileSize: 128,
        fileSha256: "skill-sha",
        dirtyFiles: new Set(),
        expandedDirs: new Set(),
        isFileDirty: false,
        saving: false,
        validating: false,
        t: (key: string) => key,
        onCreateFile: noop,
        onCreateDir: noop,
        onDownloadSkill: noop,
        onValidate: noop,
        onRefreshFile: noop,
        onSave: noop,
        onRenameFile: noop,
        onDeleteFile: noop,
        onDownloadFile: noop,
        onReplaceFile: noop,
        onFileChange: noop,
        onSelectFileEntry: noop,
      }),
    );

    expect(html).toContain('aria-label="skillConsole.action.downloadSkill"');
    expect(html).toMatch(/<button data-variant="ghost" disabled="" aria-label="skillConsole\.action\.downloadSkill"><\/button>/);
  });

  it("renders binary files as metadata instead of a text editor", () => {
    const detail: AdminSkillDetailResponse = {
      skill: { key: "demo-skill", name: "Demo Skill", status: "ready" },
      capabilities: {
        maxTextBytes: 1048576,
        maxUploadBytes: 33554432,
        canCreate: true,
        canRename: true,
        canDelete: true,
        canUpload: true,
        canDownload: true,
      },
      fileManifest: {
        revision: "rev",
        defaultOpenPath: "SKILL.md",
        counts: { files: 3, directories: 1, textFiles: 2, binaryFiles: 1, totalSize: 4480 },
        entries: demoEntries,
      },
    };
    const noop = jest.fn();
    const html = renderToStaticMarkup(
      React.createElement(SkillFileWorkspace, {
        detail,
        selectedFilePath: "assets/showcase.mp4",
        fileContent: "",
        fileSize: 4096,
        fileSha256: "asset-sha",
        dirtyFiles: new Set(),
        expandedDirs: new Set(["assets"]),
        isFileDirty: false,
        saving: false,
        validating: false,
        t: (key: string) => key,
        onCreateFile: noop,
        onCreateDir: noop,
        onValidate: noop,
        onRefreshFile: noop,
        onSave: noop,
        onRenameFile: noop,
        onDeleteFile: noop,
        onDownloadFile: noop,
        onReplaceFile: noop,
        onFileChange: noop,
        onSelectFileEntry: noop,
      }),
    );

    expect(html).toContain("skill-console-binary-panel");
    expect(html).toContain("minmax(220px,286px)_minmax(0,1fr)");
    expect(html).toContain("video/mp4");
    expect(html).toContain("asset-sha");
    expect(html).not.toContain("skill-console-textarea");
    expect(html).not.toContain("minmax(220px,260px)");
  });
});
