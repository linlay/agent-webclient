import type {
  ToolOutputSegment,
  ToolOutputState,
  ToolOutputStream,
} from "@/app/state/types";

export const TOOL_OUTPUT_MAX_BYTES = 1024 * 1024;
export const TOOL_OUTPUT_TRUNCATION_MARKER =
  "\n… [tool output truncated] …\n";

function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function appendSegment(
  segments: ToolOutputSegment[],
  segment: ToolOutputSegment,
): void {
  if (!segment.text) return;
  const previous = segments[segments.length - 1];
  if (
    previous &&
    !previous.truncationMarker &&
    !segment.truncationMarker &&
    previous.stream === segment.stream
  ) {
    previous.text += segment.text;
    return;
  }
  segments.push({ ...segment });
}

function takeTextHead(text: string, byteBudget: number): string {
  if (byteBudget <= 0 || !text) return "";
  let output = "";
  let used = 0;
  for (const character of text) {
    const size = utf8Bytes(character);
    if (used + size > byteBudget) break;
    output += character;
    used += size;
  }
  return output;
}

function takeTextTail(text: string, byteBudget: number): string {
  if (byteBudget <= 0 || !text) return "";
  const characters = Array.from(text);
  let output = "";
  let used = 0;
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const character = characters[index];
    const size = utf8Bytes(character);
    if (used + size > byteBudget) break;
    output = character + output;
    used += size;
  }
  return output;
}

function takeSegmentsHead(
  segments: ToolOutputSegment[],
  byteBudget: number,
): ToolOutputSegment[] {
  const output: ToolOutputSegment[] = [];
  let remaining = byteBudget;
  for (const segment of segments) {
    if (remaining <= 0) break;
    const text = takeTextHead(segment.text, remaining);
    appendSegment(output, { stream: segment.stream, text });
    remaining -= utf8Bytes(text);
    if (text.length < segment.text.length) break;
  }
  return output;
}

function takeSegmentsTail(
  segments: ToolOutputSegment[],
  byteBudget: number,
): ToolOutputSegment[] {
  const reversed: ToolOutputSegment[] = [];
  let remaining = byteBudget;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (remaining <= 0) break;
    const segment = segments[index];
    const text = takeTextTail(segment.text, remaining);
    if (text) reversed.push({ stream: segment.stream, text });
    remaining -= utf8Bytes(text);
    if (text.length < segment.text.length) break;
  }
  const output: ToolOutputSegment[] = [];
  reversed.reverse().forEach((segment) => appendSegment(output, segment));
  return output;
}

function splitTruncatedSegments(segments: ToolOutputSegment[]): {
  head: ToolOutputSegment[];
  tail: ToolOutputSegment[];
} {
  const markerIndex = segments.findIndex((segment) => segment.truncationMarker);
  if (markerIndex < 0) {
    return { head: segments.map((segment) => ({ ...segment })), tail: [] };
  }
  return {
    head: segments.slice(0, markerIndex).map((segment) => ({ ...segment })),
    tail: segments.slice(markerIndex + 1).map((segment) => ({ ...segment })),
  };
}

export function appendToolOutputChunk(
  current: ToolOutputState | undefined,
  input: { stream: ToolOutputStream; delta: string; chunkIndex: number },
): ToolOutputState {
  if (
    !input.delta ||
    !Number.isInteger(input.chunkIndex) ||
    input.chunkIndex < 0 ||
    input.chunkIndex <= (current?.lastChunkIndex ?? -1)
  ) {
    return current || { segments: [], lastChunkIndex: -1, truncated: false };
  }

  const markerBytes = utf8Bytes(TOOL_OUTPUT_TRUNCATION_MARKER);
  const contentBudget = TOOL_OUTPUT_MAX_BYTES - markerBytes;
  const headBudget = Math.floor(contentBudget / 2);
  const tailBudget = contentBudget - headBudget;
  let segments: ToolOutputSegment[];

  if (current?.truncated) {
    const { head, tail } = splitTruncatedSegments(current.segments);
    appendSegment(tail, { stream: input.stream, text: input.delta });
    segments = [
      ...head,
      {
        stream: "stdout",
        text: TOOL_OUTPUT_TRUNCATION_MARKER,
        truncationMarker: true,
      },
      ...takeSegmentsTail(tail, tailBudget),
    ];
  } else {
    const all = (current?.segments || []).map((segment) => ({ ...segment }));
    appendSegment(all, { stream: input.stream, text: input.delta });
    const totalBytes = all.reduce((sum, segment) => sum + utf8Bytes(segment.text), 0);
    if (totalBytes <= TOOL_OUTPUT_MAX_BYTES) {
      return {
        segments: all,
        lastChunkIndex: input.chunkIndex,
        truncated: false,
      };
    }
    segments = [
      ...takeSegmentsHead(all, headBudget),
      {
        stream: "stdout",
        text: TOOL_OUTPUT_TRUNCATION_MARKER,
        truncationMarker: true,
      },
      ...takeSegmentsTail(all, tailBudget),
    ];
  }

  return {
    segments,
    lastChunkIndex: input.chunkIndex,
    truncated: true,
  };
}

export function toolOutputText(output: ToolOutputState | undefined): string {
  return (output?.segments || []).map((segment) => segment.text).join("");
}
