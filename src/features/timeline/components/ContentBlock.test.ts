import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TimelineNode } from "@/app/state/types";
import { ContentBlock } from "@/features/timeline/components/ContentBlock";

jest.mock("@/app/state/AppContext", () => ({
	useAppDispatch: () => jest.fn(),
}));

jest.mock("@/shared/ui/MarkdownContent", () => {
	const ReactRuntime = require("react");

	return {
		MarkdownContent: ({ content }: { content: string }) =>
			ReactRuntime.createElement("div", { className: "x-markdown" }, content),
	};
});

describe("ContentBlock", () => {
	it("keeps assistant markdown whitespace collapsed instead of pre-wrapped", () => {
		const node: TimelineNode = {
			id: "content_1",
			kind: "content",
			role: "assistant",
			text: "> 第一段\n>\n> 第二段",
			ts: 100,
		};

		const html = renderToStaticMarkup(
			React.createElement(ContentBlock, { node }),
		);

		expect(html).toContain("timeline-markdown");
		expect(html).toContain("tw:whitespace-normal");
		expect(html).not.toContain("tw:whitespace-pre-wrap");
	});
});
