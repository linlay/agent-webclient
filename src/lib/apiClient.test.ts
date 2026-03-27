import {
  buildResourceUrl,
  createQueryStream,
  extractUploadChatId,
  extractUploadReferences,
  getAgents,
  getVoiceCapabilities,
  getVoiceCapabilitiesFlexible,
  getVoiceVoices,
  getVoiceVoicesFlexible,
  interruptChat,
  steerChat,
  uploadFile,
} from './apiClient';

describe('apiClient query payloads', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ code: 0, msg: 'ok', data: null }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('sends only required fields for basic query streams', async () => {
    await createQueryStream({
      requestId: 'req_1',
      message: '显示广州的天气',
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/query');
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_1',
      planningMode: false,
      message: '显示广州的天气',
    });
    expect(JSON.parse(String(options.body))).not.toHaveProperty('runId');
    expect(JSON.parse(String(options.body))).not.toHaveProperty('stream');
  });

  it('includes only present optional fields for query streams', async () => {
    await createQueryStream({
      requestId: 'req_2',
      message: '继续',
      planningMode: true,
      chatId: 'chat_1',
      agentKey: 'demoViewport',
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/query');
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_2',
      planningMode: true,
      message: '继续',
      chatId: 'chat_1',
      agentKey: 'demoViewport',
    });
  });

  it('keeps uploaded references in query streams when present', async () => {
    await createQueryStream({
      requestId: 'req_3',
      message: '',
      references: [{ id: 'upload_1', name: 'spec.md' }],
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      requestId: 'req_3',
      planningMode: false,
      message: '',
      references: [{ id: 'upload_1', name: 'spec.md' }],
    });
  });

  it('keeps runId for interrupt and steer requests', async () => {
    await interruptChat({
      requestId: 'req_interrupt',
      chatId: 'chat_1',
      runId: 'run_1',
      message: '',
    });
    await steerChat({
      requestId: 'req_steer',
      chatId: 'chat_1',
      runId: 'run_1',
      steerId: '550e8400-e29b-41d4-a716-446655440000',
      message: '再试一次',
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/interrupt');
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/steer');

    const interruptPayload = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    const steerPayload = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));

    expect(interruptPayload.runId).toBe('run_1');
    expect(steerPayload.runId).toBe('run_1');
    expect(steerPayload.steerId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('requests voice capabilities and voices from the voice api namespace', async () => {
    await getVoiceCapabilities();
    await getVoiceVoices();

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('/api/voice/capabilities');
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('/api/voice/tts/voices');
  });

  it('parses voice capabilities from standard ApiResponse payloads', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          msg: 'ok',
          data: {
            websocketPath: '/api/voice/ws',
            asr: { configured: true },
          },
        }),
    });

    await expect(getVoiceCapabilitiesFlexible()).resolves.toEqual({
      websocketPath: '/api/voice/ws',
      asr: { configured: true },
    });
  });

  it('parses voice capabilities from bare json payloads', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          websocketPath: '/api/voice/ws',
          asr: {
            defaults: {
              sampleRate: 16000,
            },
          },
        }),
    });

    await expect(getVoiceCapabilitiesFlexible()).resolves.toEqual({
      websocketPath: '/api/voice/ws',
      asr: {
        defaults: {
          sampleRate: 16000,
        },
      },
    });
  });

  it('parses voice voices from standard ApiResponse payloads', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          msg: 'ok',
          data: {
            defaultVoice: 'jarvis',
            voices: [
              { id: 'jarvis', displayName: 'Jarvis' },
            ],
          },
        }),
    });

    await expect(getVoiceVoicesFlexible()).resolves.toEqual({
      defaultVoice: 'jarvis',
      voices: [
        { id: 'jarvis', displayName: 'Jarvis' },
      ],
    });
  });

  it('parses voice voices from bare json payloads', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          defaultVoice: 'jarvis',
          voices: [
            { id: 'jarvis', displayName: 'Jarvis' },
          ],
        }),
    });

    await expect(getVoiceVoicesFlexible()).resolves.toEqual({
      defaultVoice: 'jarvis',
      voices: [
        { id: 'jarvis', displayName: 'Jarvis' },
      ],
    });
  });

  it('keeps regular endpoints on strict ApiResponse parsing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ agents: [] }),
    });

    await expect(getAgents()).rejects.toThrow(
      'Response is not ApiResponse shape',
    );
  });

  it('builds resource urls from the new resource endpoint', () => {
    expect(buildResourceUrl('reports/demo image.png')).toBe(
      '/api/resource?file=reports%2Fdemo%20image.png',
    );
  });

  it('uploads files with a single multipart request', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          msg: 'ok',
          data: {
            requestId: 'upload_req_1',
            chatId: 'chat_1',
            upload: {
              id: 'r01',
              type: 'file',
              name: 'demo.txt',
              mimeType: 'text/plain',
              sizeBytes: 4,
              url: '/api/resource?file=chat_1%2Fdemo.txt',
              sha256: 'abc123',
            },
          },
        }),
    });

    const blob = new Blob(['demo'], { type: 'text/plain' });

    await uploadFile({
      file: blob,
      filename: 'demo.txt',
      requestId: 'upload_req_1',
      chatId: 'chat_1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [uploadUrl, uploadOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(uploadUrl).toBe('/api/upload');
    expect(uploadOptions.method).toBe('POST');
    expect(uploadOptions.headers).toEqual({});
    expect(uploadOptions.body).toBeInstanceOf(FormData);

    const formData = uploadOptions.body as FormData;
    expect(formData.get('requestId')).toBe('upload_req_1');
    expect(formData.get('chatId')).toBe('chat_1');
    expect(formData.get('sha256')).toBeNull();
    const file = formData.get('file');
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe('demo.txt');
    expect((file as File).type).toBe('text/plain');
    await expect((file as File).text()).resolves.toBe('demo');
  });

  it('exposes the uploaded chat id from the new upload response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          msg: 'ok',
          data: {
            requestId: 'upload_req_2',
            chatId: 'chat_generated',
            upload: {
              id: 'r01',
              type: 'image',
              name: 'photo.png',
              mimeType: 'image/png',
              sizeBytes: 3,
              url: '/api/resource?file=chat_generated%2Fphoto.png',
              sha256: 'def456',
            },
          },
        }),
    });

    const blob = new Blob(['img'], { type: 'image/png' });
    const response = await uploadFile({
      file: blob,
      filename: 'photo.png',
      requestId: 'upload_req_2',
    });

    expect(extractUploadChatId(response.data)).toBe('chat_generated');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('extracts upload references from the new upload response', () => {
    expect(
      extractUploadReferences({
        references: [{ id: 'ref_1' }],
      }),
    ).toEqual([{ id: 'ref_1' }]);

    expect(
      extractUploadReferences({
        upload: {
          id: 'r02',
          type: 'image',
          name: 'photo.png',
          mimeType: 'image/png',
          sizeBytes: 3,
          url: '/api/resource?file=chat_generated%2Fphoto.png',
          sha256: 'def456',
        },
      }),
    ).toEqual([
      {
        id: 'r02',
        type: 'image',
        name: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 3,
        url: '/api/resource?file=chat_generated%2Fphoto.png',
        sha256: 'def456',
      },
    ]);

    expect(extractUploadReferences({ reference: { id: 'legacy' } })).toEqual([]);
    expect(extractUploadReferences(null)).toEqual([]);
  });
});
