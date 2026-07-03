import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TimelineNode } from "@/app/state/types";
import { SourceBlock } from "@/features/timeline/components/SourceBlock";
import { I18nProvider } from "@/shared/i18n";

jest.mock("@/app/state/AppContext", () => ({
	useAppDispatch: () => jest.fn(),
}));

describe("SourceBlock", () => {
	it("renders searched source count, query and expanded source entries", () => {
		const node: TimelineNode = {
			id: "source_1",
			kind: "source",
			ts: 100,
			expanded: true,
			sourceQuery: "退款流程",
			sourceCount: 1,
			chunkCount: 2,
			sources: [
				{
					id: "kbase:/docs/refund.md",
					name: "refund.md",
					title: "/docs/refund.md",
					chunkIndexes: [1, 2],
					minIndex: 1,
					chunks: [
						{
							chunkId: "hit_1",
							index: 1,
							content: "退款需要先提交申请。",
							path: "/docs/refund.md",
							heading: "退款",
							startLine: 12,
							endLine: 14,
							score: 0.82,
						},
						{
							chunkId: "hit_2",
							index: 2,
							content: "审批通过后进入打款流程。",
							path: "/docs/refund.md",
						},
					],
				},
			],
		};

		const html = renderToStaticMarkup(
			React.createElement(
				I18nProvider,
				{ locale: "zh-CN", persistLocale: false },
				React.createElement(SourceBlock, { node }),
			),
		);

		expect(html).toContain("已搜索 1 个来源");
		expect(html).toContain("&quot;退款流程&quot;");
		expect(html).toContain("refund.md");
		expect(html).toContain("source-list");
		expect(html).not.toContain("审批通过后进入打款流程。");
	});
});
