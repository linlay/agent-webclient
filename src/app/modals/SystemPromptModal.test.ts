import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	SystemPromptModal,
	__TEST_ONLY__,
} from "@/app/modals/SystemPromptModal";

const mockCopyText = jest.fn();
const mockMessageSuccess = jest.fn();
const mockMessageError = jest.fn();
let buttonProps: Array<Record<string, unknown>> = [];

jest.mock("@/shared/utils/copy", () => ({
	copyText: (...args: unknown[]) => mockCopyText(...args),
}));

jest.mock("@/shared/i18n", () => ({
	useI18n: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				"eventPopover.systemPromptModal.copy": "Copy system prompt",
				"eventPopover.systemPromptModal.copyFailed": "Could not copy system prompt",
				"eventPopover.systemPromptModal.copySuccess": "System prompt copied",
				"eventPopover.systemPromptModal.empty": "No system prompt text was found for this call.",
				"eventPopover.systemPromptModal.loading": "Loading system prompt...",
				"eventPopover.systemPromptModal.title": "System Prompt",
			};
			return labels[key] || key;
		},
	}),
}));

jest.mock("@/shared/ui/MaterialIcon", () => ({
	MaterialIcon: ({ name }: { name: string }) =>
		React.createElement("i", { "data-icon": name }),
}));

jest.mock("@/shared/ui/UiButton", () => ({
	UiButton: ({ children, iconOnly: _iconOnly, ...props }: Record<string, unknown>) => {
		buttonProps.push({ children, ...props });
		return React.createElement("button", props, children);
	},
}));

jest.mock("antd", () => ({
	Modal: ({ children, open, title }: Record<string, unknown>) =>
		open ? React.createElement("div", null, title, children) : null,
	message: {
		error: (...args: unknown[]) => mockMessageError(...args),
		success: (...args: unknown[]) => mockMessageSuccess(...args),
	},
}));

const { resolveSystemPromptCopyControl } = __TEST_ONLY__;

function renderModal(loadState: React.ComponentProps<typeof SystemPromptModal>["loadState"]) {
	buttonProps = [];
	return renderToStaticMarkup(
		React.createElement(SystemPromptModal, {
			loadState,
			open: true,
			onClose: jest.fn(),
		}),
	);
}

describe("SystemPromptModal", () => {
	beforeEach(() => {
		mockCopyText.mockReset();
		mockMessageSuccess.mockReset();
		mockMessageError.mockReset();
		(globalThis as typeof globalThis & { window?: unknown }).window = {
			setTimeout: jest.fn(() => 1),
			clearTimeout: jest.fn(),
		};
	});

	it("renders an accessible title copy button for a loaded prompt", () => {
		const html = renderModal({ status: "ready", text: "line one\nline two" });
		const copyButton = buttonProps.find(
			(props) => props["aria-label"] === "Copy system prompt",
		);

		expect(html).toContain("System Prompt");
		expect(html).toContain('data-icon="content_copy"');
		expect(copyButton).toMatchObject({
			disabled: false,
			title: "Copy system prompt",
		});
	});

	it.each([
		{ status: "loading" } as const,
		{ status: "empty" } as const,
		{ status: "error", message: "request failed" } as const,
		{ status: "ready", text: "  " } as const,
	])("disables copying while the prompt is unavailable: $status", (loadState) => {
		renderModal(loadState);
		const copyButton = buttonProps.find(
			(props) => props["aria-label"] === "Copy system prompt",
		);

		expect(copyButton).toMatchObject({ disabled: true });
	});

	it("copies the complete ready prompt when the title button is clicked", async () => {
		mockCopyText.mockResolvedValue(undefined);
		renderModal({ status: "ready", text: "line one\nline two" });
		const copyButton = buttonProps.find(
			(props) => props["aria-label"] === "Copy system prompt",
		);

		(copyButton?.onClick as (() => void) | undefined)?.();
		await Promise.resolve();
		await Promise.resolve();

		expect(mockCopyText).toHaveBeenCalledWith("line one\nline two");
		expect(mockMessageSuccess).toHaveBeenCalledWith("System prompt copied");
	});

	it("reports a localized failure when copying is rejected", async () => {
		mockCopyText.mockRejectedValue(new Error("clipboard denied"));
		renderModal({ status: "ready", text: "prompt" });
		const copyButton = buttonProps.find(
			(props) => props["aria-label"] === "Copy system prompt",
		);

		(copyButton?.onClick as (() => void) | undefined)?.();
		await Promise.resolve();
		await Promise.resolve();

		expect(mockMessageError).toHaveBeenCalledWith("Could not copy system prompt");
	});

	it("uses localized feedback and a check icon after a successful copy", () => {
		const t = (key: string) => ({
			"eventPopover.systemPromptModal.copy": "Copy system prompt",
			"eventPopover.systemPromptModal.copyFailed": "Could not copy system prompt",
			"eventPopover.systemPromptModal.copySuccess": "System prompt copied",
		}[key] || key);

		expect(
			resolveSystemPromptCopyControl(
				{ status: "ready", text: "prompt" },
				"copied",
				t,
			),
		).toEqual({
			disabled: false,
			feedbackMessage: "System prompt copied",
			icon: "check",
			text: "prompt",
		});
		expect(
			resolveSystemPromptCopyControl(
				{ status: "ready", text: "prompt" },
				"error",
				t,
			).feedbackMessage,
		).toBe("Could not copy system prompt");
	});
});
