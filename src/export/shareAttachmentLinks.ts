export interface ShareAttachmentLinks {
  preview: string;
  download: string;
  page: string;
}

export function conversationSharePath(pathname: string): string {
  const match = /^\/share\/([A-Za-z0-9_-]{1,80})\/?$/u.exec(pathname);
  return match ? `/share/${match[1]}` : "";
}

export function readShareAttachmentId(search: string): string | null {
  return new URLSearchParams(search).get("attachment");
}

export function buildShareAttachmentLinks(sharePath: string, id: string, origin: string): ShareAttachmentLinks {
  if (!conversationSharePath(sharePath) || !/^[a-f0-9]{24}$/u.test(id)) {
    return { preview: "", download: "", page: "" };
  }
  const resource = `${sharePath}/attachments/${id}`;
  return {
    preview: `${resource}/preview`,
    download: `${resource}/download`,
    page: new URL(`${sharePath}?attachment=${id}`, origin).href,
  };
}
