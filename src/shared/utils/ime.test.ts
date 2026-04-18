import { isImeEnterConfirming } from "@/shared/utils/ime";

describe("isImeEnterConfirming", () => {
	it("returns true when React nativeEvent is composing", () => {
		expect(
			isImeEnterConfirming(
				{
					key: "Enter",
					nativeEvent: { isComposing: true },
				},
				false,
			),
		).toBe(true);
	});

	it("returns true when tracked composition state is active", () => {
		expect(
			isImeEnterConfirming(
				{
					key: "Enter",
					nativeEvent: { isComposing: false },
				},
				true,
			),
		).toBe(true);
	});

	it("returns true for IME enter fallback keyCode 229", () => {
		expect(
			isImeEnterConfirming(
				{
					key: "Enter",
					nativeEvent: { keyCode: 229 },
				},
				false,
			),
		).toBe(true);
	});

	it("returns false for plain Enter outside composition", () => {
		expect(
			isImeEnterConfirming(
				{
					key: "Enter",
					nativeEvent: { isComposing: false, keyCode: 13 },
				},
				false,
			),
		).toBe(false);
	});

	it("returns false for Shift+Enter", () => {
		expect(
			isImeEnterConfirming(
				{
					key: "Enter",
					shiftKey: true,
					nativeEvent: { isComposing: true, keyCode: 229 },
				},
				true,
			),
		).toBe(false);
	});

	it("returns false for non-Enter keys", () => {
		expect(
			isImeEnterConfirming(
				{
					key: "ArrowDown",
					nativeEvent: { isComposing: true, keyCode: 229 },
				},
				true,
			),
		).toBe(false);
	});
});
