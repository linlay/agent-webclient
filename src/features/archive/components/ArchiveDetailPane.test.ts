import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArchiveDetailPane } from "@/features/archive/components/ArchiveDetailPane";

jest.mock("antd", () => ({ Spin: ({ children }: { children: React.ReactNode }) => children }));

test("archive detail shows a brief warning only for an unavailable artifact manifest", () => {
	const props = {
		selectedChatId: "chat_1",
		detail: { chatId: "chat_1", events: [] },
		loading: false,
		previewLines: [{ key: "body", label: "content", text: "conversation body" }],
		usageSummary: "",
	};
	const normal = renderToStaticMarkup(React.createElement(ArchiveDetailPane, props));
	const damaged = renderToStaticMarkup(React.createElement(ArchiveDetailPane, {
		...props,
		detail: { ...props.detail, artifactManifestUnavailable: true },
	}));
	expect(normal).toContain("conversation body");
	expect(normal).not.toContain('role="note"');
	expect(damaged).toContain("conversation body");
	expect(damaged).toContain('role="note"');
});
