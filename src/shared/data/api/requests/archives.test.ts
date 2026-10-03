import { archiveChats, deleteArchive, getArchive, getArchives, restoreArchives, searchArchives } from "@/shared/data/api/requests/archives";
import { setupRequestHarness } from "@/shared/data/__testUtils__/requestHarness";

describe("requests/archives request contracts", () => {
  const { fetchMock } = setupRequestHarness();

  it("calls archive endpoints with expected payloads and query params", async () => {
    await archiveChats({ chatIds: ["chat_1", "chat_2"] });
    await getArchives({ agentKey: "agent_a", limit: 20, offset: 40 });
    await getArchive("chat_1", true);
    await searchArchives({ query: "needle", agentKey: "agent_a", limit: 5 });
    await deleteArchive({ chatId: "chat_1" });
    await restoreArchives({ chatIds: ["chat_1"] });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/chat/archive",
    );
    expect(
      JSON.parse(
        String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
      ),
    ).toEqual({
      chatIds: ["chat_1", "chat_2"],
    });
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(
      "/api/archives?agentKey=agent_a&limit=20&offset=40",
    );
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe(
      "/api/archive?chatId=chat_1&includeRawMessages=true",
    );
    expect((fetchMock.mock.calls[3] as [string, RequestInit])[0]).toBe(
      "/api/archives/search",
    );
    expect(
      JSON.parse(
        String((fetchMock.mock.calls[3] as [string, RequestInit])[1].body),
      ),
    ).toEqual({
      query: "needle",
      agentKey: "agent_a",
      limit: 5,
    });
    expect((fetchMock.mock.calls[4] as [string, RequestInit])[0]).toBe(
      "/api/archive/delete?chatId=chat_1",
    );
    expect(
      JSON.parse(
        String((fetchMock.mock.calls[4] as [string, RequestInit])[1].body),
      ),
    ).toEqual({});
    expect((fetchMock.mock.calls[5] as [string, RequestInit])[0]).toBe(
      "/api/archive/restore",
    );
    expect(
      JSON.parse(
        String((fetchMock.mock.calls[5] as [string, RequestInit])[1].body),
      ),
    ).toEqual({
      chatIds: ["chat_1"],
    });
  });
});
