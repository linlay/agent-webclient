import {
	commitClientGateDraft,
	formatClientGateDraftState,
	parseClientGateDraftValue,
	syncClientGateDraftState,
	type ClientGateDraftState,
} from "@/features/settings/lib/settingsClientGateDrafts";

const baseConfig = {
	enabled: true,
	rmsThreshold: 0.008,
	openHoldMs: 120,
	closeHoldMs: 480,
	preRollMs: 240,
};

describe("settingsClientGateDrafts", () => {
	it("formats numeric config values into editable drafts", () => {
		expect(formatClientGateDraftState(baseConfig)).toEqual({
			rmsThreshold: "0.008",
			openHoldMs: "120",
			closeHoldMs: "480",
			preRollMs: "240",
		});
	});

	it("keeps decimal intermediate drafts parseable only on commit", () => {
		expect(parseClientGateDraftValue("rmsThreshold", "0.")).toBe(0);
		expect(parseClientGateDraftValue("rmsThreshold", ".01")).toBe(0.01);
	});

	it("falls back when a draft is empty or invalid on commit", () => {
		const drafts: ClientGateDraftState = {
			...formatClientGateDraftState(baseConfig),
			rmsThreshold: "",
		};

		expect(commitClientGateDraft("rmsThreshold", drafts, baseConfig)).toEqual({
			nextDrafts: formatClientGateDraftState(baseConfig),
			nextPatch: null,
		});
	});

	it("commits a valid draft and normalizes the field display", () => {
		const drafts: ClientGateDraftState = {
			...formatClientGateDraftState(baseConfig),
			rmsThreshold: ".01",
		};

		expect(commitClientGateDraft("rmsThreshold", drafts, baseConfig)).toEqual({
			nextDrafts: {
				...formatClientGateDraftState(baseConfig),
				rmsThreshold: "0.01",
			},
			nextPatch: {
				rmsThreshold: 0.01,
			},
		});
	});

	it("syncs from external config without clobbering the active draft field", () => {
		const drafts: ClientGateDraftState = {
			...formatClientGateDraftState(baseConfig),
			rmsThreshold: "0.",
		};

		expect(
			syncClientGateDraftState(
				drafts,
				{
					...baseConfig,
					rmsThreshold: 0.02,
					openHoldMs: 200,
				},
				"rmsThreshold",
			),
		).toEqual({
			rmsThreshold: "0.",
			openHoldMs: "200",
			closeHoldMs: "480",
			preRollMs: "240",
		});
	});
});
