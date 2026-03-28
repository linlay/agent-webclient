import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "../../context/AppContext";
import { CommandStatusOverlay } from "./CommandStatusOverlay";

jest.mock("../../context/AppContext", () => {
	const actual = jest.requireActual("../../context/AppContext");
	return {
		...actual,
		useAppState: jest.fn(),
	};
});

const { useAppState } = jest.requireMock("../../context/AppContext") as {
	useAppState: jest.Mock;
};

describe("CommandStatusOverlay", () => {
	it("renders nothing when hidden", () => {
		useAppState.mockReturnValue(createInitialState());

		expect(renderToStaticMarkup(<CommandStatusOverlay />)).toBe("");
	});

	it("renders current text and phase when visible", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			commandStatusOverlay: {
				visible: true,
				commandType: "remember",
				phase: "error",
				text: "记忆失败",
				timer: null,
			},
		});

		const html = renderToStaticMarkup(<CommandStatusOverlay />);

		expect(html).toContain("记忆失败");
		expect(html).toContain("is-error");
		expect(html).toContain("command-status-overlay");
	});
});
