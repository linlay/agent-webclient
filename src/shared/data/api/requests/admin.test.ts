import { deleteAdminSource, getAdminSource, getAdminRegistries, updateAdminSource, validateAdminRegistry } from "@/shared/data/api/requests/admin";
import { setupRequestHarness } from "@/shared/data/__testUtils__/requestHarness";

describe("requests/admin request contracts", () => {
  const { fetchMock } = setupRequestHarness();

  it("encodes logical source target query values", async () => {
    await getAdminSource({
      type: "skill",
      id: "demo skill",
      path: "references/a & b.md",
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/admin/source?type=skill&id=demo+skill&path=references%2Fa+%26+b.md",
    );
  });

  it("reads, updates, and deletes an admin source file through the typed management endpoint", async () => {
    await getAdminSource({ type: "agent", key: "editable-agent" });
    await updateAdminSource({
      target: { type: "agent", key: "editable-agent" },
      content: "# keep this comment\nkey: editable-agent\n",
      baseSha256: "source-sha",
    });
    await deleteAdminSource({
      target: {
        type: "registry",
        category: "models",
        file: "demo.yml",
      },
      baseSha256: "registry-sha",
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/admin/source?type=agent&key=editable-agent",
    );
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/admin/source",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          target: { type: "agent", key: "editable-agent" },
          content: "# keep this comment\nkey: editable-agent\n",
          baseSha256: "source-sha",
        }),
      }),
    ]);
    expect(fetchMock.mock.calls[2]).toEqual([
      "/api/admin/source",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({
          target: {
            type: "registry",
            category: "models",
            file: "demo.yml",
          },
          baseSha256: "registry-sha",
        }),
      }),
    ]);
  });

  it("serializes automation source targets by logical key", async () => {
    await getAdminSource({ type: "automation", key: "daily-report" });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/admin/source?type=automation&key=daily-report",
    );
  });

  it("uses generic source endpoints for registry text and the registry validation endpoint", async () => {
    await getAdminRegistries();
    await getAdminSource({
      type: "registry",
      category: "models",
      file: "openai.yml",
    });
    await updateAdminSource({
      target: { type: "registry", category: "models", file: "openai.yml" },
      content: "key: openai\n",
    });
    await validateAdminRegistry({
      category: "models",
      file: "openai.yml",
      content: "key: openai\n",
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/admin/registries",
    );
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(
      "/api/admin/source?type=registry&category=models&file=openai.yml",
    );
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe(
      "/api/admin/source",
    );
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[1]).toMatchObject(
      {
        method: "PUT",
        body: JSON.stringify({
          target: { type: "registry", category: "models", file: "openai.yml" },
          content: "key: openai\n",
        }),
      },
    );
    expect((fetchMock.mock.calls[3] as [string, RequestInit])[0]).toBe(
      "/api/admin/registries/validate",
    );
    expect((fetchMock.mock.calls[3] as [string, RequestInit])[1]).toMatchObject(
      {
        method: "POST",
        body: JSON.stringify({
          category: "models",
          file: "openai.yml",
          content: "key: openai\n",
        }),
      },
    );
  });
});
