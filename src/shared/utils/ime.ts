export type EnterLikeEvent = {
	key: string;
	shiftKey?: boolean;
	nativeEvent?: {
		isComposing?: boolean;
		keyCode?: number;
	};
};

export function isImeEnterConfirming(
	event: EnterLikeEvent,
	isComposing: boolean,
): boolean {
	if (event.key !== "Enter" || Boolean(event.shiftKey)) {
		return false;
	}

	if (isComposing || Boolean(event.nativeEvent?.isComposing)) {
		return true;
	}

	return event.nativeEvent?.keyCode === 229;
}
