import { computeVoiceChatTextDelta } from "./voiceChatTts";

describe("voiceChatTts helpers", () => {
	it("returns only the newly appended suffix for incremental assistant content", () => {
		expect(
			computeVoiceChatTextDelta("你好世界", "你好世界朋友们"),
		).toBe("朋友们");
		expect(
			computeVoiceChatTextDelta("hello", "hello world"),
		).toBe(" world");
	});
});
