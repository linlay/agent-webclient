/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createInitialState } from "@/app/state/AppContext";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { DebugPanelContent } from "./DebugPanel";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mockState: ReturnType<typeof createInitialState>;
const mockDispatch = jest.fn();
jest.mock("@/app/state/AppContext", () => {
	const actual = jest.requireActual("@/app/state/AppContext");
	return {
		...actual,
		useAppState: () => mockState,
		useAppDispatch: () => mockDispatch,
	};
});

jest.mock("@/features/debug/components/EventInspector", () => ({
	EventInspector: (props: {
		event: AgentEvent;
		events: readonly AgentEvent[];
		index: number;
	}) =>
		require("react").createElement("div", {
			"data-testid": "event-inspector",
			"data-event-type": props.event.type,
			"data-index": props.index,
			"data-events": props.events.length,
		}),
}));

const EVENTS = [
	{
		type: "chat.start",
		chatId: "chat_1",
		agentKey: "demo",
		timestamp: 1776518171300,
	},
] as AgentEvent[];

function renderPanel(independentDetails: boolean) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() => {
		root.render(
			<DebugPanelContent
				independentDetails={independentDetails}
				events={EVENTS}
				fallbackAgentKey="demo"
			/>,
		);
	});
	return {
		host,
		run: async (fn: () => void) => {
			await act(async () => {
				fn();
			});
		},
		unmount: () => {
			act(() => root.unmount());
			host.remove();
		},
	};
}

beforeEach(() => {
	mockState = createInitialState();
	mockDispatch.mockClear();
	document.body.innerHTML = "";
	if (typeof window.matchMedia !== "function") {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: () => ({
				matches: false,
				addListener() {},
				removeListener() {},
				addEventListener() {},
				removeEventListener() {},
			}),
		});
	}
	if (typeof (globalThis as any).ResizeObserver !== "function") {
		(globalThis as any).ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	}
});

test("the independent debug surface opens the shared event inspector", async () => {
	const panel = renderPanel(true);
	try {
		await panel.run(() => {
			(panel.host.querySelector('[data-event-index="0"]') as HTMLElement).click();
		});
		const inspector = panel.host.querySelector('[data-testid="event-inspector"]');
		expect(inspector).not.toBeNull();
		expect(inspector!.getAttribute("data-event-type")).toBe("chat.start");
		expect(inspector!.getAttribute("data-index")).toBe("0");
		expect(inspector!.getAttribute("data-events")).toBe("1");
		expect(mockDispatch).not.toHaveBeenCalled();
	} finally {
		panel.unmount();
	}
});

test("the right-sidebar mount still drives the global popover", async () => {
	const panel = renderPanel(false);
	try {
		await panel.run(() => {
			(panel.host.querySelector('[data-event-index="0"]') as HTMLElement).click();
		});
		expect(panel.host.querySelector('[data-testid="event-inspector"]')).toBeNull();
		expect(mockDispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "SET_EVENT_POPOVER",
				index: 0,
				event: EVENTS[0],
			}),
		);
	} finally {
		panel.unmount();
	}
});
