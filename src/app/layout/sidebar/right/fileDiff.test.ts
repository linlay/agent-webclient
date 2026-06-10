import { buildLineDiffRows } from "@/app/layout/sidebar/right/fileDiff";

describe("buildLineDiffRows", () => {
	it("returns no rows for two empty files", () => {
		expect(buildLineDiffRows("", "")).toEqual([]);
	});

	it("represents a new file as added lines", () => {
		expect(buildLineDiffRows("", "one\ntwo\n")).toEqual([
			{ type: "add", oldLineNumber: null, newLineNumber: 1, text: "one" },
			{ type: "add", oldLineNumber: null, newLineNumber: 2, text: "two" },
		]);
	});

	it("represents an empty current file as deleted lines", () => {
		expect(buildLineDiffRows("one\ntwo\n", "")).toEqual([
			{ type: "delete", oldLineNumber: 1, newLineNumber: null, text: "one" },
			{ type: "delete", oldLineNumber: 2, newLineNumber: null, text: "two" },
		]);
	});

	it("keeps context around ordinary modifications", () => {
		expect(buildLineDiffRows("one\ntwo\nthree\n", "one\nTWO\nthree\n")).toEqual([
			{ type: "context", oldLineNumber: 1, newLineNumber: 1, text: "one" },
			{ type: "add", oldLineNumber: null, newLineNumber: 2, text: "TWO" },
			{ type: "delete", oldLineNumber: 2, newLineNumber: null, text: "two" },
			{ type: "context", oldLineNumber: 3, newLineNumber: 3, text: "three" },
		]);
	});
});
