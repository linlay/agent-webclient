import {
	mergeVoiceChatUtterance,
	normalizeVoiceChatUtteranceForLength,
	resolveVoiceChatWsUrl,
} from "./voiceChatAudio";

describe("voiceChatAudio helpers", () => {
	it("merges latin utterances with a separator when needed", () => {
		expect(mergeVoiceChatUtterance("hello", "world")).toBe("hello world");
		expect(mergeVoiceChatUtterance("你好", "世界")).toBe("你好世界");
	});

	it("normalizes punctuation and whitespace for utterance length checks", () => {
		expect(normalizeVoiceChatUtteranceForLength(" 你，好！ ")).toBe("你好");
		expect(normalizeVoiceChatUtteranceForLength("a-b c")).toBe("abc");
	});

	it("builds websocket urls from the current browser location", () => {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {
				location: {
					protocol: "https:",
					host: "voice.example.com",
				},
			},
		});

		expect(resolveVoiceChatWsUrl("/api/voice/ws")).toBe(
			"wss://voice.example.com/api/voice/ws",
		);
	});
});
