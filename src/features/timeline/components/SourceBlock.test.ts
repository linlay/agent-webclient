import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TimelineNode } from "@/app/state/types";
import {
	SourceBlock,
	formatSourceLocator,
	formatSourceScore,
} from "@/features/timeline/components/SourceBlock";
import { I18nProvider } from "@/shared/i18n";

jest.mock("@/app/state/AppContext", () => ({
	useAppDispatch: () => jest.fn(),
}));

describe("SourceBlock", () => {
	it("formats source locators and scores", () => {
		expect(
			formatSourceLocator({
				chunkId: "chunk_1",
				index: 1,
				content: "snippet",
				startLine: 12,
				endLine: 14,
				pageStart: 3,
				slideStart: 2,
				sourceType: "markdown",
				matchType: "semantic",
			}),
		).toBe("第 12-14 行 · 第 3 页 · 第 2 页幻灯片 · markdown · semantic");
		expect(formatSourceScore(0.82)).toBe("score 0.82");
	});

	it("renders source count, query, path, locator, snippet and collapsed chunk count", () => {
		const node: TimelineNode = {
			id: "source_1",
			kind: "source",
			ts: 100,
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

		expect(html).toContain("检索到 1 个来源");
		expect(html).toContain("2 个片段");
		expect(html).toContain("查询：退款流程");
		expect(html).toContain("refund.md");
		expect(html).toContain("/docs/refund.md");
		expect(html).toContain("第 12-14 行");
		expect(html).toContain("退款需要先提交申请。");
		expect(html).toContain("score 0.82");
		expect(html).toContain("还有 1 个");
		expect(html).not.toContain("审批通过后进入打款流程。");
	});
});
