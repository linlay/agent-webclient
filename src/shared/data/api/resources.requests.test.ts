import { Blob } from "buffer";
import { URL as NodeURL } from "node:url";
import { MAX_CONVERSATION_HTML_BYTES } from "@/shared/data/conversationExport";
import { getResourceBlob, getResourceDocumentMetadata, getResourceText, downloadResource, downloadChatExport, downloadConversationHtmlExport, getChatLLMTraceRaw, getChatRawJsonl, downloadAdminSkill, downloadAdminSkillFile, fetchAdminSkillFileBlob, fetchAdminSkillIcon, fetchConnectorIcon } from "@/shared/data/api/resources";
import { setAccessToken } from "@/shared/data/api/http";
import { setupRequestHarness } from "@/shared/data/__testUtils__/requestHarness";

describe("resources request contracts", () => {
  const { fetchMock } = setupRequestHarness();

  it("reads authoritative resource document metadata and size from HEAD", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Length": "128",
        "X-Document-Kind": "document-markdown",
        "X-Document-Revision": "128:42",
      }),
    });

    await expect(
      getResourceDocumentMetadata("artifacts/run_1/novel.md", {
        chatId: "chat_1",
      }),
    ).resolves.toEqual({
      documentKind: "document-markdown",
      mimeType: "text/markdown",
      revision: "128:42",
      sizeBytes: 128,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/resource?"),
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("keeps documentKind absent when the authoritative header is missing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        "Content-Type": "application/octet-stream",
        "Content-Length": "12",
      }),
    });

    await expect(
      getResourceDocumentMetadata("artifacts/run_1/novel.md", {
        chatId: "chat_1",
      }),
    ).resolves.toEqual({
      mimeType: "application/octet-stream",
      revision: "",
      sizeBytes: 12,
    });
  });

  it("fetches skill icons with bearer authentication", async () => {
    setAccessToken("skill-icon-token");
    const blob = new Blob(["png"], { type: "image/png" });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "image/png" }),
      blob: async () => blob,
    });

    await expect(
      fetchAdminSkillIcon(
        "/api/admin/skills/file/download?id=demo&path=assets%2Fdemo.png",
      ),
    ).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/skills/file/download?id=demo&path=assets%2Fdemo.png",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer skill-icon-token",
        }),
      }),
    );
  });

  it.each(["image/png", "image/svg+xml"])(
    "fetches connector icons as authenticated %s blobs",
    async (contentType) => {
      setAccessToken("connector-icon-token");
      const blob = new Blob(["icon"], { type: contentType });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "Content-Type": contentType }),
        blob: async () => blob,
      });
      const url = "/api/connectors/icon?id=wecom&v=hash";
      await expect(fetchConnectorIcon(url)).resolves.toBe(blob);
      expect(fetchMock).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer connector-icon-token",
          }),
        }),
      );
    },
  );

  it.each([
    "https://external.example/icon.svg",
    "//external.example/icon.png",
    "/api/connectors/icon/../private",
    "/api/admin/connectors",
  ])("rejects unexpected connector icon URLs: %s", async (url) => {
    await expect(fetchConnectorIcon(url)).rejects.toThrow(
      "connector icon URL is invalid",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-image connector icon responses", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/html" }),
    });
    await expect(
      fetchConnectorIcon("/api/connectors/icon?id=wecom"),
    ).rejects.toThrow("connector icon response is not a supported image");
  });

  it("rejects unexpected or non-image skill icon responses without exposing the token", async () => {
    await expect(
      fetchAdminSkillIcon("https://example.com/demo.png"),
    ).rejects.toMatchObject({
      message: "skill icon URL is invalid",
    });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/html" }),
      blob: async () => new Blob(["not an image"]),
    });
    await expect(
      fetchAdminSkillIcon(
        "/api/admin/skills/file/download?id=demo&path=assets%2Fdemo.png",
      ),
    ).rejects.toMatchObject({ message: "skill icon response is not an image" });
  });

  it("fetches skill file blobs for previews with bearer authentication", async () => {
    setAccessToken("skill-file-token");
    const blob = new Blob(["png"], { type: "image/png" });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "image/png" }),
      blob: async () => blob,
    });

    await expect(
      fetchAdminSkillFileBlob("demo-skill", "assets/demo.png"),
    ).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/skills/file/download?id=demo-skill&path=assets%2Fdemo.png",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer skill-file-token",
        }),
      }),
    );
  });

  it("rejects skill file blob responses that are not ok", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Headers({ "Content-Type": "text/plain" }),
      text: async () => "not found",
      blob: async () => new Blob([""]),
    });

    await expect(
      fetchAdminSkillFileBlob("demo-skill", "assets/missing.png"),
    ).rejects.toMatchObject({
      status: 404,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("downloads skill files and archives through authenticated Blob requests", async () => {
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "document",
    );
    const urlDescriptor = Object.getOwnPropertyDescriptor(globalThis, "URL");
    const click = jest.fn();
    const anchor = { href: "", download: "", rel: "", click };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: {
        createElement: jest.fn(() => anchor),
        body: { appendChild: jest.fn(), removeChild: jest.fn() },
      },
    });
    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      writable: true,
      value: {
        createObjectURL: jest.fn(() => "blob:skill"),
        revokeObjectURL: jest.fn(),
      },
    });
    jest.useFakeTimers();
    setAccessToken("skill-download-token");
    const response = (filename: string) => ({
      ok: true,
      status: 200,
      headers: new Headers({
        "Content-Disposition": `attachment; filename="${filename}"`,
      }),
      blob: async () => new Blob(["zip"]),
    });
    fetchMock
      .mockResolvedValueOnce(response("asset.bin"))
      .mockResolvedValueOnce(response("demo-skill.zip"));

    try {
      await downloadAdminSkillFile("demo-skill", "assets/asset.bin");
      await downloadAdminSkill("demo-skill");
      jest.runAllTimers();
    } finally {
      jest.useRealTimers();
      if (documentDescriptor)
        Object.defineProperty(globalThis, "document", documentDescriptor);
      else Reflect.deleteProperty(globalThis, "document");
      if (urlDescriptor)
        Object.defineProperty(globalThis, "URL", urlDescriptor);
      else Reflect.deleteProperty(globalThis, "URL");
    }

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/admin/skills/file/download?id=demo-skill&path=assets%2Fasset.bin",
      "/api/admin/skills/download?id=demo-skill",
    ]);
    for (const [, options] of fetchMock.mock.calls as Array<
      [string, RequestInit]
    >) {
      expect(options.headers).toEqual(
        expect.objectContaining({
          Authorization: "Bearer skill-download-token",
        }),
      );
    }
    expect(click).toHaveBeenCalledTimes(2);
    expect(anchor.download).toBe("demo-skill.zip");
  });

  it("uses current chatId for authenticated Blob and text resource reads", async () => {
    const blob = new Blob(["image"], { type: "image/png" });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: async () => blob,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "artifact text",
      });
    setAccessToken("resource-token");

    await expect(
      getResourceBlob("image.png", { chatId: "chat_01" }),
    ).resolves.toBe(blob);
    await expect(
      getResourceText("report.txt", { chatId: "chat_01" }),
    ).resolves.toBe("artifact text");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/resource?file=chat_01%2Fimage.png",
      "/api/resource?file=chat_01%2Freport.txt",
    ]);
    for (const [, options] of fetchMock.mock.calls as Array<
      [string, RequestInit]
    >) {
      expect(options.headers).toEqual({
        "X-Locale": "zh-CN",
        Authorization: "Bearer resource-token",
      });
      expect(options.credentials).toBe("same-origin");
    }
  });

  it("sends Workspace and tmp absolute paths with chat context so Platform decides access", async () => {
    const blob = new Blob(["absolute"], { type: "image/png" });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => blob,
    });
    setAccessToken("absolute-token");

    await expect(
      getResourceBlob("/Users/alice/project/%E5%A4%8F%E6%97%A5%20%231%25.png", {
        chatId: "chat_01",
      }),
    ).resolves.toBe(blob);
    await expect(
      getResourceBlob("/tmp/poster.png", {
        chatId: "chat_01",
      }),
    ).resolves.toBe(blob);
    await expect(
      getResourceBlob("/tmp/team.png", {
        chatId: "chat_01",
        teamChat: true,
      }),
    ).resolves.toBe(blob);

    expect(fetchMock.mock.calls.map(([requestUrl]) => requestUrl)).toEqual([
      "/api/resource?file=%2FUsers%2Falice%2Fproject%2F%E5%A4%8F%E6%97%A5+%231%25.png&chatId=chat_01",
      "/api/resource?file=%2Ftmp%2Fposter.png&chatId=chat_01",
      "/api/resource?file=%2Ftmp%2Fteam.png&chatId=chat_01",
    ]);
    for (const [, options] of fetchMock.mock.calls as Array<
      [string, RequestInit]
    >) {
      expect(options.headers).toEqual({
        "X-Locale": "zh-CN",
        Authorization: "Bearer absolute-token",
      });
      expect(options.credentials).toBe("same-origin");
    }
  });

  it("downloads resources with auth headers and a browser blob download", async () => {
    const createObjectURL = jest.fn(() => "blob:download");
    const revokeObjectURL = jest.fn();
    const click = jest.fn();
    const appendChild = jest.fn();
    const removeChild = jest.fn();
    const createElement = jest.fn(() => ({
      click,
      href: "",
      download: "",
      rel: "",
    }));

    global.document = {
      body: {
        appendChild,
        removeChild,
      },
      createElement,
    } as unknown as Document;
    global.URL = {
      createObjectURL,
      revokeObjectURL,
    } as unknown as typeof global.URL;
    setAccessToken("demo-token");

    const blob = new Blob(["demo"]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: async () => blob,
    });

    await downloadResource("demo.txt", {
      filename: "demo.txt",
      chatId: "chat_1",
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/resource?file=chat_1%2Fdemo.txt");
    expect(options.method).toBe("GET");
    expect(options.headers).toEqual({
      "X-Locale": "zh-CN",
      Authorization: "Bearer demo-token",
    });
    expect(options.credentials).toBe("same-origin");
    expect(createElement).toHaveBeenCalledWith("a");
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledTimes(1);
  });

  it("resolves ChatScope download urls with chatId and never sends Bearer cross-origin", async () => {
    const createObjectURL = jest.fn(() => "blob:download");
    const revokeObjectURL = jest.fn();
    const click = jest.fn();
    global.document = {
      body: {
        appendChild: jest.fn(),
        removeChild: jest.fn(),
      },
      createElement: jest.fn(() => ({
        click,
        href: "",
        download: "",
        rel: "",
      })),
    } as unknown as Document;
    global.URL = {
      createObjectURL,
      revokeObjectURL,
    } as unknown as typeof global.URL;
    setAccessToken("private-platform-token");
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(["demo"]),
    });

    await downloadResource("artifacts/run_01/image.png", {
      filename: "image.png",
      chatId: "chat_01",
    });
    await downloadResource("https://cdn.example.com/public.png", {
      filename: "public.png",
      chatId: "chat_01",
    });

    const [logicalUrl, logicalOptions] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const [externalUrl, externalOptions] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(logicalUrl).toBe(
      "/api/resource?file=chat_01%2Fartifacts%2Frun_01%2Fimage.png",
    );
    expect(logicalOptions.headers).toEqual({
      "X-Locale": "zh-CN",
      Authorization: "Bearer private-platform-token",
    });
    expect(externalUrl).toBe("https://cdn.example.com/public.png");
    expect(externalOptions.headers).toEqual({});
    expect(externalOptions.credentials).toBeUndefined();
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("shows the failure reason when resource downloads fail without structured codes", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({
          code: 40301,
          msg: "token expired",
          data: null,
        }),
    });

    await expect(
      downloadResource("private.txt", { chatId: "chat_01" }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("下载失败"),
      status: 403,
      code: 40301,
      platformError: expect.objectContaining({
        status: 403,
        message: expect.stringContaining("下载失败"),
      }),
    });
  });

  it("decodes RFC 5987 filenames from chat export content disposition", async () => {
    const createObjectURL = jest.fn(() => "blob:chat-export");
    const revokeObjectURL = jest.fn();
    const click = jest.fn();
    const appendChild = jest.fn();
    const removeChild = jest.fn();
    const anchor = {
      click,
      href: "",
      download: "",
      rel: "",
    };

    global.document = {
      body: {
        appendChild,
        removeChild,
      },
      createElement: jest.fn(() => anchor),
    } as unknown as Document;
    global.URL = {
      createObjectURL,
      revokeObjectURL,
    } as unknown as typeof global.URL;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) =>
          key.toLowerCase() === "content-disposition"
            ? "attachment; filename*=UTF-8''%E4%BD%A0%E5%A5%BD.md"
            : null,
      },
      blob: async () => new Blob(["demo"]),
    });

    await downloadChatExport("chat_1");

    expect(anchor.download).toBe("你好.md");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("assembles an HTML download from the Platform snapshot and Tunnel template", async () => {
    const snapshot = '{"version":1,"title":"Conversation"}';
    const template =
      '<meta name="conversation-export-local-brand" content="__CONVERSATION_EXPORT_LOCAL_BRAND_ID__"><link href="__CONVERSATION_EXPORT_ASSET_ORIGIN__/runtime.css"><script type="application/json">__CONVERSATION_EXPORT_SNAPSHOT_JSON_V1__</script>';
    let downloadedBlob: Blob | undefined;
    const anchor = { click: jest.fn(), href: "", download: "", rel: "" };
    global.document = {
      body: { appendChild: jest.fn(), removeChild: jest.fn() },
      createElement: jest.fn(() => anchor),
    } as unknown as Document;
    class MockURL extends NodeURL {}
    Object.assign(MockURL, {
      createObjectURL: jest.fn((blob: Blob) => {
        downloadedBlob = blob;
        return "blob:conversation-html";
      }),
      revokeObjectURL: jest.fn(),
    });
    global.URL = MockURL as typeof global.URL;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (key: string) => {
            switch (key.toLowerCase()) {
              case "content-type":
                return "application/json; charset=utf-8";
              case "content-length":
                return String(snapshot.length);
              case "content-disposition":
                return 'attachment; filename="conversation.snapshot.json"';
              default:
                return null;
            }
          },
        },
        blob: async () => new Blob([snapshot], { type: "application/json" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (key: string) => {
            switch (key.toLowerCase()) {
              case "content-type":
                return "text/html; charset=utf-8";
              case "content-length":
                return String(template.length);
              default:
                return null;
            }
          },
        },
        text: async () => template,
      });
    (
      globalThis as typeof globalThis & {
        __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
      }
    ).__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      CONVERSATION_EXPORT_ASSET_ORIGIN: "http://127.0.0.1:11961",
      BRAND_ID: "cutej",
    };

    await downloadConversationHtmlExport("chat_1");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/chat/export?chatId=chat_1&format=snapshot",
    );
    expect(
      (fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Accept,
    ).toBe("application/json");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://127.0.0.1:11961/assets/conversation-export/conversation.template.html",
    );
    expect(fetchMock.mock.calls[1][1]?.credentials).toBe("omit");
    expect(anchor.download).toBe("conversation.html");
    expect(anchor.click).toHaveBeenCalledTimes(1);
    await expect(downloadedBlob?.text()).resolves.toBe(
      `<meta name="conversation-export-local-brand" content="cutej"><link href="http://127.0.0.1:11961/runtime.css"><script type="application/json">${snapshot}</script>`,
    );
  });

  it("rejects HTML export when the runtime asset origin is missing", async () => {
    await expect(downloadConversationHtmlExport("chat_1")).rejects.toThrow(
      "conversation_export_asset_origin_invalid",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects snapshot export early when Content-Length exceeds 20 MiB", async () => {
    const blob = jest.fn();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (key: string) => {
            switch (key.toLowerCase()) {
              case "content-type":
                return "application/json; charset=utf-8";
              case "content-length":
                return String(MAX_CONVERSATION_HTML_BYTES + 1);
              default:
                return null;
            }
          },
        },
        blob,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (key: string) =>
            key.toLowerCase() === "content-type" ? "text/html" : null,
        },
        text: async () =>
          "__CONVERSATION_EXPORT_SNAPSHOT_JSON_V1____CONVERSATION_EXPORT_ASSET_ORIGIN____CONVERSATION_EXPORT_LOCAL_BRAND_ID__",
      });
    (
      globalThis as typeof globalThis & {
        __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
      }
    ).__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      CONVERSATION_EXPORT_ASSET_ORIGIN: "http://127.0.0.1:11961",
      BRAND_ID: "zenmind",
    };

    await expect(downloadConversationHtmlExport("chat_1")).rejects.toThrow(
      `actual=${MAX_CONVERSATION_HTML_BYTES + 1} limit=${MAX_CONVERSATION_HTML_BYTES}`,
    );
    expect(blob).not.toHaveBeenCalled();
  });

  it("rejects an oversized assembled HTML Blob", async () => {
    const template =
      "__CONVERSATION_EXPORT_SNAPSHOT_JSON_V1____CONVERSATION_EXPORT_ASSET_ORIGIN____CONVERSATION_EXPORT_LOCAL_BRAND_ID__";
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (key: string) =>
            key.toLowerCase() === "content-type"
              ? "application/json; charset=utf-8"
              : null,
        },
        blob: async () =>
          new Blob([Buffer.alloc(MAX_CONVERSATION_HTML_BYTES)], {
            type: "application/json",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (key: string) =>
            key.toLowerCase() === "content-type"
              ? "text/html; charset=utf-8"
              : null,
        },
        text: async () => template,
      });
    (
      globalThis as typeof globalThis & {
        __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
      }
    ).__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      CONVERSATION_EXPORT_ASSET_ORIGIN: "http://127.0.0.1:11961",
      BRAND_ID: "zenmind",
    };

    await expect(downloadConversationHtmlExport("chat_1")).rejects.toThrow(
      `limit=${MAX_CONVERSATION_HTML_BYTES}`,
    );
  });

  it("loads raw chat jsonl as authenticated text", async () => {
    setAccessToken("demo-token");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '{"_type":"query"}\n',
    });

    await expect(getChatRawJsonl("chat_1")).resolves.toBe(
      '{"_type":"query"}\n',
    );

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/chat/jsonl?chatId=chat_1");
    expect(options.method).toBe("GET");
    expect(options.headers).toEqual({
      "X-Locale": "zh-CN",
      Authorization: "Bearer demo-token",
    });
  });

  it("loads raw llm trace json as authenticated text", async () => {
    setAccessToken("demo-token");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '{"runId":"run_1"}\n',
    });

    await expect(
      getChatLLMTraceRaw("chat_1/.llm-records/run_1_001.json"),
    ).resolves.toBe('{"runId":"run_1"}\n');

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "/api/chat/llm-trace?file=chat_1%2F.llm-records%2Frun_1_001.json",
    );
    expect(options.method).toBe("GET");
    expect(options.headers).toEqual({
      "X-Locale": "zh-CN",
      Authorization: "Bearer demo-token",
    });
  });

  it("shows the failure reason when raw chat jsonl loading fails without structured codes", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () =>
        JSON.stringify({
          code: 404,
          msg: "chat not found",
          data: {},
        }),
    });

    await expect(getChatRawJsonl("missing")).rejects.toMatchObject({
      message: expect.stringContaining("加载资源文本失败"),
      status: 404,
      code: 404,
      platformError: expect.objectContaining({
        status: 404,
        message: expect.stringContaining("加载资源文本失败"),
      }),
    });
  });
});
