function normalizeLineBreaks(input) {
  return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function splitSseFrames(buffer) {
  const normalized = normalizeLineBreaks(buffer);
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  return {
    frames: parts,
    rest
  };
}

export function parseSseFrame(frame) {
  const parsed = {
    event: 'message',
    data: '',
    id: undefined,
    retry: undefined,
    comments: []
  };

  const dataLines = [];
  const lines = normalizeLineBreaks(frame).split('\n');

  for (const rawLine of lines) {
    const line = rawLine ?? '';
    if (!line) {
      continue;
    }

    if (line.startsWith(':')) {
      parsed.comments.push(line.slice(1));
      continue;
    }

    const colonIndex = line.indexOf(':');
    let field = line;
    let value = '';

    if (colonIndex >= 0) {
      field = line.slice(0, colonIndex);
      value = line.slice(colonIndex + 1);
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }
    }

    if (field === 'event') {
      parsed.event = value || 'message';
      continue;
    }

    if (field === 'data') {
      dataLines.push(value);
      continue;
    }

    if (field === 'id') {
      parsed.id = value;
      continue;
    }

    if (field === 'retry') {
      const retryValue = Number.parseInt(value, 10);
      parsed.retry = Number.isFinite(retryValue) ? retryValue : undefined;
    }
  }

  parsed.data = dataLines.join('\n');
  return parsed;
}

export async function consumeSseStream(readable, options = {}) {
  if (!readable) {
    throw new Error('ReadableStream is required for SSE parsing');
  }

  const {
    onEvent,
    onComment,
    signal
  } = options;

  const decoder = new TextDecoder();
  const reader = readable.getReader();
  let buffer = '';

  const ensureNotAborted = () => {
    if (signal?.aborted) {
      throw new Error('SSE stream aborted by client');
    }
  };

  const emitFrame = (frame) => {
    const parsed = parseSseFrame(frame);
    if (parsed.comments.length > 0) {
      onComment?.(parsed.comments);
    }
    if (parsed.data.length > 0 || parsed.event !== 'message' || parsed.id !== undefined) {
      onEvent?.(parsed);
    }
  };

  while (true) {
    ensureNotAborted();
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const { frames, rest } = splitSseFrames(buffer);
    buffer = rest;

    for (const frame of frames) {
      emitFrame(frame);
    }
  }

  buffer += decoder.decode();
  const trailing = buffer.trim();
  if (trailing) {
    emitFrame(trailing);
  }
}

export async function consumeJsonSseStream(response, options = {}) {
  if (!response?.ok) {
    throw new Error(`SSE response is not OK: ${response?.status ?? 'unknown'}`);
  }

  const {
    onJson,
    onParseError,
    onComment,
    signal
  } = options;

  await consumeSseStream(response.body, {
    signal,
    onComment,
    onEvent: (event) => {
      if (!event.data) {
        return;
      }
      try {
        const json = JSON.parse(event.data);
        onJson?.(json, event);
      } catch (error) {
        onParseError?.(error, event.data, event);
      }
    }
  });
}
