/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { copyText } from "@/shared/utils/copy";
import { EventInspector } from "./EventInspector";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockT = (key: string) => key;
jest.mock("@/shared/i18n", () => {
	const actual = jest.requireActual("@/shared/i18n");
	return { ...actual, useI18n: () => ({ t: mockT }) };
});
jest.mock("antd", () => ({
	Popover: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock("@/shared/data", () => ({
	getChatSystemPrompt: jest.fn(() => new Promise(() => undefined)),
	getChatRawJsonl: jest.fn(async () => "raw-jsonl"),
	getChatLLMTraceRaw: jest.fn(async () => "raw-llm-json"),
}));
jest.mock("@/shared/utils/copy", () => ({
	copyText: jest.fn(async () => undefined),
}));
jest.mock("./SystemPromptModal", () => ({
	SystemPromptModal: () => null,
}));

function renderInspector(
	props: React.ComponentProps<typeof EventInspector>,
) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() => root.render(<EventInspector {...props} />));
	return {
		host,
		unmount: () => {
			act(() => root.unmount());
			host.remove();
		},
	};
}

beforeEach(() => {
	jest.mocked(copyText).mockClear();
	document.body.innerHTML = "";
});

test("exposes the same copy and raw JSONL actions as the sidebar popover", async () => {
	const event = {
		type: "chat.start",
		chatId: "chat_1",
		timestamp: 1776518171300,
	} as AgentEvent;
	const { host, unmount } = renderInspector({
		event,
		events: [event],
		index: 0,
		onClose: jest.fn(),
	});
	try {
		expect(host.querySelector("#event-popover")).not.toBeNull();
		expect(host.querySelector('[aria-label="eventPopover.copy.openMenu"]')).not.toBeNull();
		expect(host.querySelector('[aria-label="eventPopover.action.copyRawJsonl"]')).not.toBeNull();

		await act(async () => {
			host.querySelector("#event-popover")!.dispatchEvent(
				new MouseEvent("dblclick", { bubbles: true }),
			);
		});
		expect(copyText).toHaveBeenCalledWith(JSON.stringify(event, null, 2));
	} finally {
		unmount();
	}
});

test("renders the system prompt action from the supplied replay event set", () => {
	const event = {
		type: "run.start",
		chatId: "chat_1",
		runId: "run_1",
		agentKey: "demo",
	} as AgentEvent;
	const { host, unmount } = renderInspector({
		event,
		events: [event],
		index: 0,
		onClose: jest.fn(),
	});
	try {
		expect(
			host.querySelector('[aria-label="eventPopover.action.systemPrompt"]'),
		).not.toBeNull();
	} finally {
		unmount();
	}
});

test("closes through the host callback", async () => {
	const onClose = jest.fn();
	const event = { type: "tool.end", toolId: "tool_1" } as AgentEvent;
	const { host, unmount } = renderInspector({
		event,
		events: [event],
		index: 0,
		onClose,
	});
	try {
		await act(async () => {
			(host.querySelector('[aria-label="eventPopover.close"]') as HTMLButtonElement).click();
		});
		expect(onClose).toHaveBeenCalledTimes(1);
	} finally {
		unmount();
	}
});
