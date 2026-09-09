/** @jest-environment jsdom */
import { fetchSkillIcon } from "./resources";
import { setAccessToken } from "./http";

const originalFetch = globalThis.fetch;
const fetchMock = jest.fn();
beforeEach(() => { globalThis.fetch = fetchMock; fetchMock.mockReset(); setAccessToken("skill-test-token"); });
afterEach(() => { globalThis.fetch = originalFetch; setAccessToken(""); });

it("reads agent and admin icons with authentication and cancellation", async () => {
  const blob = new Blob(["icon"], { type: "image/png" });
  fetchMock.mockResolvedValue({ ok: true, status: 200, headers: new Headers({ "Content-Type": "image/png" }), blob: async () => blob });
  const controller = new AbortController();
  for (const url of ["/api/skills/icon?agentKey=zenmi&key=pdf", "/api/admin/skills/file/download?key=pdf&path=assets%2Fpdf.png"]) {
    await expect(fetchSkillIcon(url, { signal: controller.signal })).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenLastCalledWith(url, expect.objectContaining({ signal: controller.signal, headers: expect.objectContaining({ Authorization: "Bearer skill-test-token" }) }));
  }
});

it("rejects other destinations and non-image responses", async () => {
  for (const url of ["https://example.com/icon.png", "//example.com/icon.png", "/api/file?path=secret", "/api/skills/icon#fragment"]) {
    await expect(fetchSkillIcon(url)).rejects.toThrow("skill icon URL is invalid");
  }
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValue({ ok: true, status: 200, headers: new Headers({ "Content-Type": "text/html" }) });
  await expect(fetchSkillIcon("/api/skills/icon?agentKey=zenmi&key=pdf")).rejects.toThrow("skill icon response is not an image");
});
