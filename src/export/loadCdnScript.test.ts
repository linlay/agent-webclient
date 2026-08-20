import { loadCdnScript } from "./loadCdnScript";

describe("loadCdnScript", () => {
  it("loads each pinned URL once with SRI and privacy attributes", async () => {
    const listeners = new Map<string, () => void>();
    const script = {
      src: "",
      integrity: "",
      crossOrigin: "",
      referrerPolicy: "",
      async: false,
      addEventListener: jest.fn((name: string, listener: () => void) => {
        listeners.set(name, listener);
      }),
    };
    const append = jest.fn(() => listeners.get("load")?.());
    const originalDocument = global.document;
    const runtimeURL = "https://share.example.test/assets/conversation-export/hash/runtime.js";
    global.document = {
      createElement: jest.fn(() => script),
      getElementById: jest.fn(() => ({ src: runtimeURL })),
      head: { append },
    } as unknown as Document;
    const asset = {
      version: "1.2.3",
      url: "example.min.js",
      integrity: `sha384-${"A".repeat(64)}`,
    };

    try {
      const first = loadCdnScript(asset);
      const second = loadCdnScript(asset);
      expect(first).toBe(second);
      await first;
      expect(append).toHaveBeenCalledTimes(1);
      expect(script).toMatchObject({
        src: "https://share.example.test/assets/conversation-export/hash/example.min.js",
        integrity: asset.integrity,
        crossOrigin: "anonymous",
        referrerPolicy: "no-referrer",
        async: true,
      });
    } finally {
      global.document = originalDocument;
    }
  });

  it("shares a failed request without inserting duplicate scripts", async () => {
    const listeners = new Map<string, () => void>();
    const script = {
      src: "",
      integrity: "",
      crossOrigin: "",
      referrerPolicy: "",
      async: false,
      addEventListener: jest.fn((name: string, listener: () => void) => {
        listeners.set(name, listener);
      }),
    };
    const append = jest.fn(() => listeners.get("error")?.());
    const originalDocument = global.document;
    const runtimeURL = "https://share.example.test/assets/conversation-export/hash/runtime.js";
    global.document = {
      createElement: jest.fn(() => script),
      getElementById: jest.fn(() => ({ src: runtimeURL })),
      head: { append },
    } as unknown as Document;
    const asset = {
      version: "9.9.9",
      url: "failing-example.min.js",
      integrity: `sha384-${"B".repeat(64)}`,
    };

    try {
      const first = loadCdnScript(asset);
      const second = loadCdnScript(asset);
      expect(first).toBe(second);
      await expect(first).rejects.toThrow("cdn_load_failed");
      await expect(second).rejects.toThrow("cdn_load_failed");
      expect(append).toHaveBeenCalledTimes(1);
    } finally {
      global.document = originalDocument;
    }
  });
});
