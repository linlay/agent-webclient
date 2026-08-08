import {
  createObjectUrlLease,
  withBlobMimeTypeFallback,
} from "@/shared/ui/authenticatedResourceUrl";

describe("withBlobMimeTypeFallback", () => {
  it.each(["", "application/octet-stream"])(
    "repairs a generic Blob MIME type: %s",
    (type) => {
      const source = new Blob(["video"], { type });
      const normalized = withBlobMimeTypeFallback(source, "video/mp4");

      expect(normalized).not.toBe(source);
      expect(normalized.type).toBe("video/mp4");
      expect(normalized.size).toBe(source.size);
    },
  );

  it("preserves a specific server MIME type", () => {
    const source = new Blob(["video"], { type: "video/webm" });
    expect(withBlobMimeTypeFallback(source, "video/mp4")).toBe(source);
  });
});

describe("createObjectUrlLease", () => {
  it("revokes the Blob URL exactly once when a resource effect is cleaned up", () => {
    const createObjectURL = jest.fn(() => "blob:resource-preview");
    const revokeObjectURL = jest.fn();
    const lease = createObjectUrlLease(new Blob(["image"]), {
      createObjectURL,
      revokeObjectURL,
    });

    expect(lease.url).toBe("blob:resource-preview");
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    lease.revoke();
    lease.revoke();

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:resource-preview");
  });

  it("releases the previous URL on resource change and the current URL on unmount", () => {
    const createObjectURL = jest
      .fn()
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const revokeObjectURL = jest.fn();
    const urlApi = { createObjectURL, revokeObjectURL };

    const first = createObjectUrlLease(new Blob(["first"]), urlApi);
    first.revoke();
    const second = createObjectUrlLease(new Blob(["second"]), urlApi);
    second.revoke();

    expect(revokeObjectURL.mock.calls).toEqual([
      ["blob:first"],
      ["blob:second"],
    ]);
  });
});
