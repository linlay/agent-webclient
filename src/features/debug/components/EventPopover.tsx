import React from "react";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import { EventInspector } from "@/features/debug/components/EventInspector";

/**
 * Global event details overlay driven by the right-sidebar debug tab.
 *
 * The panel itself lives in `EventInspector` so the independent
 * `/debug/:chatId` surface can render the exact same copy, collect and
 * system-prompt actions with its own replay event set.
 */
export const EventPopover: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const event = state.eventPopoverEventRef;
	if (state.eventPopoverIndex < 0 || !event) {
		return null;
	}

	return (
		<EventInspector
			event={event}
			events={state.debugEvents}
			index={state.eventPopoverIndex}
			anchor={state.eventPopoverAnchor}
			onClose={() =>
				dispatch({
					type: "SET_EVENT_POPOVER",
					index: -1,
					event: null,
					anchor: null,
				})
			}
		/>
	);
};

export { __TEST_ONLY__ } from "@/features/debug/components/EventInspector";
