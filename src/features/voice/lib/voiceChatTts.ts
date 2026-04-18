export function computeVoiceChatTextDelta(
	previousText: string,
	nextText: string,
): string {
	const previous = String(previousText || "");
	const next = String(nextText || "");
	if (!next) return "";
	if (!previous) return next;
	if (next === previous) return "";

	const maxPrefix = Math.min(previous.length, next.length);
	let prefixLength = 0;
	while (
		prefixLength < maxPrefix &&
		previous.charCodeAt(prefixLength) === next.charCodeAt(prefixLength)
	) {
		prefixLength += 1;
	}
	return next.slice(prefixLength);
}
