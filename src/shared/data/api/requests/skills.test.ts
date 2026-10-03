import { Blob } from "buffer";
import { buildAdminSkillDownloadUrl, buildAdminSkillFileDownloadUrl } from "@/shared/data/api/resources";
import { getAdminSource, updateAdminSource } from "@/shared/data/api/requests/admin";
import { getAdminSkills, createAdminSkillFile, createAdminSkill, deleteAdminSkill, deleteAdminSkillFile, getAdminSkillDetail, importAdminSkill, mkdirAdminSkillFile, renameAdminSkillFile, uploadAdminSkillFile, validateAdminSkill } from "@/shared/data/api/requests/skills";
import { setupRequestHarness } from "@/shared/data/__testUtils__/requestHarness";

describe("requests/skills request contracts", () => {
  const { fetchMock } = setupRequestHarness();

  it("uses canonical skills admin manifest and generic source endpoints", async () => {
    await getAdminSkills();
    await getAdminSkillDetail("demo-skill", "SKILL.md");
    await getAdminSource({
      type: "skill",
      id: "demo-skill",
      path: "SKILL.md",
    });
    await updateAdminSource({
      target: { type: "skill", id: "demo-skill", path: "SKILL.md" },
      content: "# My Skill",
      baseSha256: "abc123",
    });
    await createAdminSkillFile({
      id: "demo-skill",
      path: "references/new.md",
      content: "",
    });
    await mkdirAdminSkillFile({
      id: "demo-skill",
      path: "assets",
    });
    await renameAdminSkillFile({
      id: "demo-skill",
      fromPath: "old.md",
      toPath: "new.md",
    });
    await deleteAdminSkillFile({
      id: "demo-skill",
      path: "old.md",
      baseSha256: "old-sha",
    });
    await validateAdminSkill("demo-skill");
    await createAdminSkill({
      id: "new-skill",
      skillMd: "---\nname: New Skill\n---\n",
    });
    await deleteAdminSkill("demo-skill");

    const calls = fetchMock.mock.calls.map(([url, options]) => ({
      url,
      method: (options as RequestInit).method || "GET",
      body: JSON.parse(String((options as RequestInit).body || "{}")),
    }));

    expect(calls).toEqual([
      { url: "/api/admin/skills", method: "GET", body: {} },
      {
        url: "/api/admin/skills/detail?id=demo-skill&openPath=SKILL.md",
        method: "GET",
        body: {},
      },
      {
        url: "/api/admin/source?type=skill&id=demo-skill&path=SKILL.md",
        method: "GET",
        body: {},
      },
      {
        url: "/api/admin/source",
        method: "PUT",
        body: {
          target: { type: "skill", id: "demo-skill", path: "SKILL.md" },
          content: "# My Skill",
          baseSha256: "abc123",
        },
      },
      {
        url: "/api/admin/skills/file/create",
        method: "POST",
        body: {
          id: "demo-skill",
          path: "references/new.md",
          content: "",
        },
      },
      {
        url: "/api/admin/skills/file/mkdir",
        method: "POST",
        body: {
          id: "demo-skill",
          path: "assets",
        },
      },
      {
        url: "/api/admin/skills/file/rename",
        method: "POST",
        body: {
          id: "demo-skill",
          fromPath: "old.md",
          toPath: "new.md",
        },
      },
      {
        url: "/api/admin/skills/file/delete",
        method: "POST",
        body: {
          id: "demo-skill",
          path: "old.md",
          baseSha256: "old-sha",
        },
      },
      {
        url: "/api/admin/skills/validate",
        method: "POST",
        body: { id: "demo-skill" },
      },
      {
        url: "/api/admin/skills/create",
        method: "POST",
        body: {
          id: "new-skill",
          skillMd: "---\nname: New Skill\n---\n",
        },
      },
      {
        url: "/api/admin/skills/delete",
        method: "POST",
        body: { id: "demo-skill" },
      },
    ]);

    expect(
      buildAdminSkillFileDownloadUrl("demo-skill", "assets/blob.bin"),
    ).toBe(
      "/api/admin/skills/file/download?id=demo-skill&path=assets%2Fblob.bin",
    );
    expect(buildAdminSkillDownloadUrl("demo-skill")).toBe(
      "/api/admin/skills/download?id=demo-skill",
    );
  });

  it("uploads skills admin files with multipart form data", async () => {
    const blob = new Blob(["demo"], { type: "text/plain" });

    await uploadAdminSkillFile({
      id: "demo-skill",
      path: "assets/demo.txt",
      file: blob,
      overwrite: true,
    });

    const [uploadUrl, uploadOptions] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(uploadUrl).toBe("/api/admin/skills/file/upload");
    expect(uploadOptions.method).toBe("POST");
    expect(uploadOptions.headers).toEqual({ "X-Locale": "zh-CN" });
    expect(uploadOptions.body).toBeInstanceOf(FormData);

    const formData = uploadOptions.body as FormData;
    expect(formData.get("id")).toBe("demo-skill");
    expect(formData.get("path")).toBe("assets/demo.txt");
    expect(formData.get("overwrite")).toBe("true");
    expect(formData.get("file")).toBe(blob);
  });

  it("imports a complete skill ZIP with multipart form data", async () => {
    const archive = new File(["zip"], "demo-skill.zip", {
      type: "application/zip",
    });

    await importAdminSkill({ id: "demo-skill", file: archive });

    const [importUrl, importOptions] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(importUrl).toBe("/api/admin/skills/import");
    expect(importOptions.method).toBe("POST");
    expect(importOptions.headers).toEqual({ "X-Locale": "zh-CN" });
    expect(importOptions.body).toBeInstanceOf(FormData);

    const formData = importOptions.body as FormData;
    expect(formData.get("id")).toBe("demo-skill");
    expect(formData.get("file")).toBe(archive);
  });

  it("uploads a ZIP without a id so Platform can identify a skill or package", async () => {
    const archive = new File(["zip"], "wecomcli-suite.zip", {
      type: "application/zip",
    });
    await importAdminSkill({ file: archive });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/skills/import");
    const form = options.body as FormData;
    expect(form.get("id")).toBeNull();
    expect(form.get("file")).toBe(archive);
  });
});
