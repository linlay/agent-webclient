export type FileDiffRowType = "context" | "add" | "delete";

export interface FileDiffRow {
	type: FileDiffRowType;
	oldLineNumber: number | null;
	newLineNumber: number | null;
	text: string;
}

const MAX_LCS_CELLS = 4_000_000;

export function buildLineDiffRows(original: string, current: string): FileDiffRow[] {
	const oldLines = splitDiffLines(original);
	const newLines = splitDiffLines(current);
	if (oldLines.length === 0 && newLines.length === 0) {
		return [];
	}
	if (oldLines.length * newLines.length > MAX_LCS_CELLS) {
		return buildFallbackDiffRows(oldLines, newLines);
	}
	return buildLcsDiffRows(oldLines, newLines);
}

function splitDiffLines(content: string): string[] {
	if (!content) {
		return [];
	}
	const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
	if (lines[lines.length - 1] === "") {
		lines.pop();
	}
	return lines;
}

function buildLcsDiffRows(oldLines: string[], newLines: string[]): FileDiffRow[] {
	const oldCount = oldLines.length;
	const newCount = newLines.length;
	const dp = Array.from({ length: oldCount + 1 }, () =>
		new Array<number>(newCount + 1).fill(0),
	);

	for (let oldIndex = oldCount - 1; oldIndex >= 0; oldIndex -= 1) {
		for (let newIndex = newCount - 1; newIndex >= 0; newIndex -= 1) {
			dp[oldIndex][newIndex] =
				oldLines[oldIndex] === newLines[newIndex]
					? dp[oldIndex + 1][newIndex + 1] + 1
					: Math.max(dp[oldIndex + 1][newIndex], dp[oldIndex][newIndex + 1]);
		}
	}

	const rows: FileDiffRow[] = [];
	let oldIndex = 0;
	let newIndex = 0;
	let oldLineNumber = 1;
	let newLineNumber = 1;

	while (oldIndex < oldCount || newIndex < newCount) {
		if (
			oldIndex < oldCount &&
			newIndex < newCount &&
			oldLines[oldIndex] === newLines[newIndex]
		) {
			rows.push({
				type: "context",
				oldLineNumber,
				newLineNumber,
				text: oldLines[oldIndex],
			});
			oldIndex += 1;
			newIndex += 1;
			oldLineNumber += 1;
			newLineNumber += 1;
			continue;
		}

		if (
			newIndex < newCount &&
			(oldIndex >= oldCount || dp[oldIndex][newIndex + 1] >= dp[oldIndex + 1][newIndex])
		) {
			rows.push({
				type: "add",
				oldLineNumber: null,
				newLineNumber,
				text: newLines[newIndex],
			});
			newIndex += 1;
			newLineNumber += 1;
			continue;
		}

		rows.push({
			type: "delete",
			oldLineNumber,
			newLineNumber: null,
			text: oldLines[oldIndex],
		});
		oldIndex += 1;
		oldLineNumber += 1;
	}

	return rows;
}

function buildFallbackDiffRows(oldLines: string[], newLines: string[]): FileDiffRow[] {
	let prefix = 0;
	while (
		prefix < oldLines.length &&
		prefix < newLines.length &&
		oldLines[prefix] === newLines[prefix]
	) {
		prefix += 1;
	}

	let suffix = 0;
	while (
		suffix + prefix < oldLines.length &&
		suffix + prefix < newLines.length &&
		oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
	) {
		suffix += 1;
	}

	const rows: FileDiffRow[] = [];
	for (let index = 0; index < prefix; index += 1) {
		rows.push({
			type: "context",
			oldLineNumber: index + 1,
			newLineNumber: index + 1,
			text: oldLines[index],
		});
	}
	for (let index = prefix; index < oldLines.length - suffix; index += 1) {
		rows.push({
			type: "delete",
			oldLineNumber: index + 1,
			newLineNumber: null,
			text: oldLines[index],
		});
	}
	for (let index = prefix; index < newLines.length - suffix; index += 1) {
		rows.push({
			type: "add",
			oldLineNumber: null,
			newLineNumber: index + 1,
			text: newLines[index],
		});
	}
	for (let offset = suffix; offset > 0; offset -= 1) {
		const oldIndex = oldLines.length - offset;
		const newIndex = newLines.length - offset;
		rows.push({
			type: "context",
			oldLineNumber: oldIndex + 1,
			newLineNumber: newIndex + 1,
			text: oldLines[oldIndex],
		});
	}
	return rows;
}
