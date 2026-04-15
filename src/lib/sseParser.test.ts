import { ReadableStream } from 'stream/web';
import { consumeJsonSseStream, parseSseFrame } from './sseParser';

function createJsonSseResponse(body: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });

  return {
    ok: true,
    status: 200,
    body: stream,
  } as Response;
}

describe('parseSseFrame', () => {
  it('keeps raw frame and parses multiline data/id/retry/comments', () => {
    const receivedAt = 1710000000000;
    const frame = [
      ': first comment',
      'event: tool.result',
      'id: evt-7',
      'retry: 5000',
      'data: {"a":1}',
      'data: {"b":2}',
    ].join('\n');

    const parsed = parseSseFrame(frame, receivedAt);

    expect(parsed.comments).toEqual([' first comment']);
    expect(parsed.event).toBe('tool.result');
    expect(parsed.id).toBe('evt-7');
    expect(parsed.retry).toBe(5000);
    expect(parsed.data).toBe('{"a":1}\n{"b":2}');
    expect(parsed.rawFrame).toBe(frame);
    expect(parsed.receivedAt).toBe(receivedAt);
  });
});

describe('consumeJsonSseStream', () => {
  it('fills json.type from the SSE event name when the payload omits it', async () => {
    const response = createJsonSseResponse(
      'event: tool.start\ndata: {"toolId":"call_1"}\n\n',
    );

    const received: Array<Record<string, unknown>> = [];
    await consumeJsonSseStream(response, {
      onJson: (json) => {
        received.push(json);
      },
    });

    expect(received).toEqual([
      {
        type: 'tool.start',
        toolId: 'call_1',
      },
    ]);
  });

  it('preserves payload type when it is already present', async () => {
    const response = createJsonSseResponse(
      'event: tool.start\ndata: {"type":"tool.snapshot","toolId":"call_1"}\n\n',
    );

    const received: Array<Record<string, unknown>> = [];
    await consumeJsonSseStream(response, {
      onJson: (json) => {
        received.push(json);
      },
    });

    expect(received).toEqual([
      {
        type: 'tool.snapshot',
        toolId: 'call_1',
      },
    ]);
  });
});
