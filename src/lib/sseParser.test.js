import { describe, expect, it } from 'vitest';

import { consumeSseStream, parseSseFrame, splitSseFrames } from './sseParser.js';

function createReadableFromStrings(parts) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    }
  });
}

describe('sseParser', () => {
  it('splits and parses multi-line data frame', () => {
    const { frames, rest } = splitSseFrames('event:message\ndata:{"a":1}\ndata:{"b":2}\n\n');
    expect(rest).toBe('');
    expect(frames).toHaveLength(1);

    const parsed = parseSseFrame(frames[0]);
    expect(parsed.event).toBe('message');
    expect(parsed.data).toBe('{"a":1}\n{"b":2}');
  });

  it('consumes fragmented stream and keeps comments', async () => {
    const frames = [];
    const comments = [];

    await consumeSseStream(
      createReadableFromStrings([
        ':heartbeat\n\n',
        'data:{"type":"run.start"',
        '}\n\n',
        'data:{"type":"run.complete"}\n\n'
      ]),
      {
        onComment: (items) => comments.push(items.join(',')),
        onEvent: (event) => frames.push(event)
      }
    );

    expect(comments.length).toBe(1);
    expect(frames).toHaveLength(2);
    expect(frames[0].data).toBe('{"type":"run.start"}');
    expect(frames[1].data).toBe('{"type":"run.complete"}');
  });
});
