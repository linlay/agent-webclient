import { buildShareAttachmentLinks, conversationSharePath, readShareAttachmentId } from "./shareAttachmentLinks";

const id = "0123456789abcdef01234567";

it("builds one clean attachment entry without copying credentials, query parameters or fragments", () => {
  expect(conversationSharePath("/share/share-1")).toBe("/share/share-1");
  expect(buildShareAttachmentLinks("/share/share-1", id, "https://share.example.test")).toEqual({
    preview: `/share/share-1/attachments/${id}/preview`,
    download: `/share/share-1/attachments/${id}/download`,
    page: `https://share.example.test/share/share-1?attachment=${id}`,
  });
});

it("only recognizes a share page and refuses malformed resource paths", () => {
  for (const path of ["/preview", "/share/", "/share/a/attachments/x/preview", "/share/bad.id", "/share/" + "a".repeat(81)]) {
    expect(conversationSharePath(path)).toBe("");
  }
  expect(buildShareAttachmentLinks("", id, "null").page).toBe("");
  expect(buildShareAttachmentLinks("/share/share-1", "../other", "https://share.example.test").preview).toBe("");
});

it("distinguishes normal conversations from empty or invalid attachment deep links", () => {
  expect(readShareAttachmentId("?other=1")).toBeNull();
  expect(readShareAttachmentId("?attachment=")).toBe("");
  expect(readShareAttachmentId("?attachment=missing")).toBe("missing");
  expect(readShareAttachmentId(`?attachment=${id}`)).toBe(id);
});
