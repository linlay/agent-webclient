import { rememberChat, learnChat, compactChat, deriveChat, deleteChat, getChatSystemPrompt, getChats, markChatRead, normalizeChatSummariesPayload, renameChat, searchGlobal, submitFeedback } from "@/shared/data/api/requests/chats";
import { setAccessToken } from "@/shared/data/api/http";
import { setupRequestHarness } from "@/shared/data/__testUtils__/requestHarness";

describe("requests/chats request contracts", () => {
  const { fetchMock } = setupRequestHarness();

  it("posts chatId and runId for markChatRead", async () => {
    await markChatRead({
      chatId: "chat_read",
      runId: "run_read",
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/read",
    );
    const payload = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    );
    expect(payload).toEqual({
      chatId: "chat_read",
      runId: "run_read",
    });
  });

  it("posts agentKey for markChatRead all", async () => {
    await markChatRead({ agentKey: "agent_a" });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/read",
    );
    const payload = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    );
    expect(payload).toEqual({
      agentKey: "agent_a",
    });
  });

  it("posts feedback, delete, and global search payloads", async () => {
    await submitFeedback({
      chatId: "chat_1",
      runId: "run_1",
      type: "thumbs_down",
      comment: "bad",
    });
    await deleteChat({ chatId: "chat_1" });
    await renameChat({ chatId: "chat_1", chatName: " Renamed chat " });
    await searchGlobal({
      query: "needle",
      agentKey: "agent_a",
      teamId: "team_a",
      limit: 7,
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/feedback",
    );
    expect(
      JSON.parse(
        String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
      ),
    ).toEqual({
      chatId: "chat_1",
      runId: "run_1",
      type: "thumbs_down",
      comment: "bad",
    });
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(
      "/api/chat/delete?chatId=chat_1",
    );
    expect(
      JSON.parse(
        String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body),
      ),
    ).toEqual({});
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe(
      "/api/chat/rename?chatId=chat_1",
    );
    expect(
      JSON.parse(
        String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body),
      ),
    ).toEqual({
      chatName: " Renamed chat ",
    });
    expect((fetchMock.mock.calls[3] as [string, RequestInit])[0]).toBe(
      "/api/chats/search",
    );
    expect(
      JSON.parse(
        String((fetchMock.mock.calls[3] as [string, RequestInit])[1].body),
      ),
    ).toEqual({
      query: "needle",
      agentKey: "agent_a",
      teamId: "team_a",
      limit: 7,
    });
  });

  it("posts derive chat payload", async () => {
    await deriveChat({
      sourceChatId: "chat_1",
      sourceRunId: "run_1",
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/chat/derive",
    );
    expect(
      JSON.parse(
        String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
      ),
    ).toEqual({
      sourceChatId: "chat_1",
      sourceRunId: "run_1",
    });
  });

  it("posts remember, learn, and compact commands to their dedicated endpoints", async () => {
    await rememberChat({
      requestId: "req_remember",
      chatId: "chat_1",
    });
    await learnChat({
      requestId: "req_learn",
      chatId: "chat_1",
    });
    await compactChat({
      requestId: "req_compact",
      chatId: "chat_1",
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/remember",
    );
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(
      "/api/learn",
    );
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe(
      "/api/compact",
    );

    const rememberPayload = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    );
    const learnPayload = JSON.parse(
      String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body),
    );
    const compactPayload = JSON.parse(
      String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body),
    );

    expect(rememberPayload).toEqual({
      requestId: "req_remember",
      chatId: "chat_1",
    });
    expect(learnPayload).toEqual({
      requestId: "req_learn",
      chatId: "chat_1",
    });
    expect(compactPayload).toEqual({
      requestId: "req_compact",
      chatId: "chat_1",
      trigger: "manual",
      level: "summary",
    });

    expect(rememberPayload).not.toHaveProperty("message");
    expect(rememberPayload).not.toHaveProperty("planningMode");
    expect(rememberPayload).not.toHaveProperty("runId");
    expect(rememberPayload).not.toHaveProperty("agentKey");
    expect(rememberPayload).not.toHaveProperty("teamId");
    expect(learnPayload).not.toHaveProperty("message");
    expect(learnPayload).not.toHaveProperty("planningMode");
    expect(learnPayload).not.toHaveProperty("runId");
    expect(learnPayload).not.toHaveProperty("agentKey");
    expect(learnPayload).not.toHaveProperty("teamId");
    expect(compactPayload).not.toHaveProperty("message");
    expect(compactPayload).not.toHaveProperty("planningMode");
    expect(compactPayload).not.toHaveProperty("runId");
    expect(compactPayload).not.toHaveProperty("agentKey");
    expect(compactPayload).not.toHaveProperty("teamId");
  });

  it("supports filtering getChats by agentKey", async () => {
    await getChats({ agentKey: "agent-a" });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/chats?agentKey=agent-a",
    );
  });

  it("normalizes chat runtime summaries while respecting explicit status flags", () => {
    expect(
      normalizeChatSummariesPayload([
        {
          chatId: "active-awaiting",
          activeRun: { runId: "run_1" },
          awaiting: { awaitingId: "await_1", mode: "question" },
        },
        {
          chatId: "completed",
          activeRun: { runId: "stale_run" },
          awaiting: { awaitingId: "stale_await" },
          hasActiveRun: false,
          hasPendingAwaiting: false,
        },
        { chatId: "legacy" },
      ]),
    ).toEqual([
      expect.objectContaining({
        chatId: "active-awaiting",
        hasActiveRun: true,
        hasPendingAwaiting: true,
      }),
      expect.objectContaining({
        chatId: "completed",
        hasActiveRun: false,
        hasPendingAwaiting: false,
      }),
      { chatId: "legacy", hasPendingAwaiting: false },
    ]);
  });

  it("loads a run system prompt using the replay-safe run identity", async () => {
    setAccessToken("demo-token");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          msg: "success",
          data: {
            chatId: "chat_1",
            runId: "run_1",
            agentKey: "demo",
            systemRef: {
              agentKey: "demo",
              cacheKey: "react:main",
              fingerprint: "sha256:test",
            },
            systemMessage: { role: "system", content: "stored prompt" },
          },
        }),
    });

    await expect(
      getChatSystemPrompt({
        chatId: "chat_1",
        runId: "run_1",
        agentKey: "demo",
      }),
    ).resolves.toMatchObject({
      data: { systemMessage: { content: "stored prompt" } },
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "/api/chat/system-prompt?chatId=chat_1&runId=run_1&agentKey=demo",
    );
    expect(options.method).toBe("GET");
    expect(options.headers).toEqual({
      "X-Locale": "zh-CN",
      Authorization: "Bearer demo-token",
      "Content-Type": "application/json",
    });
  });

  it("propagates errors when the persisted run system prompt is unavailable", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () =>
        JSON.stringify({
          code: 404,
          msg: "system prompt not found",
          data: {},
        }),
    });

    await expect(
      getChatSystemPrompt({
        chatId: "chat_1",
        runId: "run_legacy",
        agentKey: "demo",
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: 404,
    });
  });

  it("normalizes chat summaries from /api/chats into hasPendingAwaiting while preserving read state", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: 0,
          msg: "ok",
          data: [
            {
              chatId: "chat_1",
              chatName: "Need approval",
              source: "automation:daily",
              read: {
                isRead: false,
                readAt: 456,
                readRunId: "run_1",
              },
              awaiting: {
                awaitingId: "await_1",
                runId: "run_1",
                mode: "approval",
                createdAt: 123,
              },
            },
            {
              chatId: "chat_2",
              chatName: "No waiting",
              teamId: "team_1",
            },
          ],
        }),
    });

    const response = await getChats({ mode: "CODER" });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/chats?mode=CODER",
    );

    expect(response.data).toEqual([
      {
        chatId: "chat_1",
        chatName: "Need approval",
        source: "automation:daily",
        read: {
          isRead: false,
          readAt: 456,
          readRunId: "run_1",
        },
        awaiting: {
          awaitingId: "await_1",
          runId: "run_1",
          mode: "approval",
          createdAt: 123,
        },
        hasPendingAwaiting: true,
      },
      {
        chatId: "chat_2",
        chatName: "No waiting",
        teamId: "team_1",
        hasPendingAwaiting: false,
      },
    ]);
  });
});
