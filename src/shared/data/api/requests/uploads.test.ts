import { Blob } from "buffer";
import { extractUploadChatId, extractUploadReferences, uploadFile } from "@/shared/data/api/requests/uploads";
import { setupRequestHarness } from "@/shared/data/__testUtils__/requestHarness";

describe("requests/uploads request contracts", () => {
  const { fetchMock } = setupRequestHarness();

  it("uploads files with a single multipart request", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          msg: "ok",
          data: {
            requestId: "upload_req_1",
            chatId: "chat_1",
            upload: {
              id: "r01",
              type: "file",
              name: "demo.txt",
              mimeType: "text/plain",
              sizeBytes: 4,
              url: "/api/resource?file=chat_1%2Fdemo.txt",
              sha256: "abc123",
            },
          },
        }),
    });

    const blob = new Blob(["demo"], { type: "text/plain" });

    await uploadFile({
      file: blob,
      filename: "demo.txt",
      requestId: "upload_req_1",
      chatId: "chat_1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [uploadUrl, uploadOptions] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(uploadUrl).toBe("/api/upload");
    expect(uploadOptions.method).toBe("POST");
    expect(uploadOptions.headers).toEqual({ "X-Locale": "zh-CN" });
    expect(uploadOptions.body).toBeInstanceOf(FormData);

    const formData = uploadOptions.body as FormData;
    expect(formData.get("requestId")).toBe("upload_req_1");
    expect(formData.get("chatId")).toBe("chat_1");
    expect(formData.get("sha256")).toBeNull();
    const file = formData.get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("demo.txt");
    expect((file as File).type).toBe("text/plain");
    await expect((file as File).text()).resolves.toBe("demo");
  });

  it("exposes the uploaded chat id from the new upload response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          msg: "ok",
          data: {
            requestId: "upload_req_2",
            chatId: "chat_generated",
            upload: {
              id: "r01",
              type: "image",
              name: "photo.png",
              path: "/workspace/photo.png",
              mimeType: "image/png",
              sizeBytes: 3,
              url: "/api/resource?file=chat_generated%2Fphoto.png",
              sha256: "def456",
            },
          },
        }),
    });

    const blob = new Blob(["img"], { type: "image/png" });
    const response = await uploadFile({
      file: blob,
      filename: "photo.png",
      requestId: "upload_req_2",
    });

    expect(extractUploadChatId(response.data)).toBe("chat_generated");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("extracts upload references from the new upload response", () => {
    expect(
      extractUploadReferences({
        references: [{ id: "ref_1" }],
      }),
    ).toEqual([{ id: "ref_1" }]);

    expect(
      extractUploadReferences({
        upload: {
          id: "r02",
          type: "image",
          name: "photo.png",
          path: "/workspace/photo.png",
          mimeType: "image/png",
          sizeBytes: 3,
          url: "/api/resource?file=chat_generated%2Fphoto.png",
          sha256: "def456",
        },
      }),
    ).toEqual([
      {
        id: "r02",
        type: "image",
        name: "photo.png",
        path: "/workspace/photo.png",
        mimeType: "image/png",
        sizeBytes: 3,
        url: "/api/resource?file=chat_generated%2Fphoto.png",
        sha256: "def456",
      },
    ]);

    expect(extractUploadReferences(null)).toEqual([]);
  });
});
