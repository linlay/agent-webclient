import { buildTextPreviewLines } from "@/features/artifacts/components/AttachmentPreviewPanel";

describe("buildTextPreviewLines", () => {
	it("marks the requested line as the target line", () => {
		expect(buildTextPreviewLines("one\ntwo\nthree", 2)).toEqual([
			{ lineNumber: 1, text: "one", target: false },
			{ lineNumber: 2, text: "two", target: true },
			{ lineNumber: 3, text: "three", target: false },
		]);
	});

	it("normalizes invalid target lines to no highlight", () => {
		expect(buildTextPreviewLines("one", 0)).toEqual([
			{ lineNumber: 1, text: "one", target: false },
		]);
	});
});
