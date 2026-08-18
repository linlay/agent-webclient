import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockUseAuthenticatedResourceUrl = jest.fn();

jest.mock("@/app/state/AppContext", () => ({
  useAppDispatch: () => jest.fn(),
  useAppState: () => ({
    chatId: "chat_01",
    chats: [],
    rightSidebarOpen: false,
    rightSidebarOpenTab: null,
    viewerTabs: [],
    activeViewerKey: "",
  }),
}));

jest.mock("@/shared/ui/useAuthenticatedResourceUrl", () => ({
  useAuthenticatedResourceUrl: (...args: unknown[]) =>
    mockUseAuthenticatedResourceUrl(...args),
}));

import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";

describe("AttachmentCard logical resources", () => {
  beforeEach(() => {
    mockUseAuthenticatedResourceUrl.mockReset();
    mockUseAuthenticatedResourceUrl.mockReturnValue({
      url: "blob:artifact-thumbnail",
      loading: false,
      error: null,
    });
  });

  it("previews an Artifact image with the current chatId Blob URL", () => {
    const html = renderToStaticMarkup(
      React.createElement(AttachmentCard, {
        attachment: {
          name: "image.png",
          type: "image",
          mimeType: "image/png",
          url: "artifacts/run_01/image.png",
        },
        variant: "timeline",
      }),
    );

    expect(mockUseAuthenticatedResourceUrl).toHaveBeenCalledWith(
      "artifacts/run_01/image.png",
      "chat_01",
      { teamChat: false },
    );
    expect(html).toContain('src="blob:artifact-thumbnail"');
  });

  it("keeps unsupported files interactive so activation opens Viewer", () => {
    const html = renderToStaticMarkup(
      React.createElement(AttachmentCard, {
        attachment: {
          name: "archive.zip",
          mimeType: "application/zip",
          url: "artifacts/run_01/archive.zip",
        },
        variant: "timeline",
      }),
    );

    expect(html).toContain('data-attachment-kind="file"');
    expect(html).toContain('role="button"');
    expect(html).toContain('class="attachment-card attachment-card-timeline attachment-card-default is-file is-interactive"');
  });
});
