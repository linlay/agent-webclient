/** @jest-environment jsdom */
import { requestWithAuth } from "./http";
import { configureI18nRuntime } from "@/shared/i18n/runtime";
import { isAppMode } from "@/shared/utils/routing";
import { getAppAccessToken, refreshAppAccessToken } from "@/shared/data/auth/appAuth";

jest.mock("@/shared/utils/routing", () => ({ isAppMode: jest.fn(() => false) }));
jest.mock("@/shared/config/backendMode", () => ({ isGatewayBackendMode: () => false }));
jest.mock("@/shared/data/auth/appAuth", () => ({ getAppAccessToken: jest.fn(), refreshAppAccessToken: jest.fn() }));

const originalFetch = globalThis.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isAppMode).mockReturnValue(false);
  globalThis.fetch = jest.fn().mockResolvedValue({ status: 200 });
  configureI18nRuntime({ locale: "zh-CN" });
});
afterEach(() => { globalThis.fetch = originalFetch; });

test("HTTP catalog reads use UI locale rather than browser Accept-Language", async () => {
  await requestWithAuth("/api/admin/skill-packages");
  expect(fetch).toHaveBeenLastCalledWith("/api/admin/skill-packages", expect.objectContaining({
    headers: expect.objectContaining({ "X-Locale": "zh-CN" }),
  }));
  configureI18nRuntime({ locale: "en-US" });
  await requestWithAuth("/api/admin/skills");
  expect(fetch).toHaveBeenLastCalledWith("/api/admin/skills", expect.objectContaining({
    headers: expect.objectContaining({ "X-Locale": "en-US" }),
  }));
});

test("authentication waits cannot move an in-flight request into another language", async () => {
  jest.mocked(isAppMode).mockReturnValue(true);
  jest.mocked(getAppAccessToken).mockReturnValue(null);
  let finishAuth!: (token: string) => void;
  jest.mocked(refreshAppAccessToken).mockReturnValue(new Promise(resolve => { finishAuth = resolve; }));
  const request = requestWithAuth("/api/admin/skill-packages");
  configureI18nRuntime({ locale: "en-US" });
  finishAuth("token");
  await request;
  expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    headers: expect.objectContaining({ "X-Locale": "zh-CN" }),
  }));
});

test("explicit request locale is respected and unauthenticated external fetches stay untouched", async () => {
  await requestWithAuth("/api/skills", { headers: { "x-locale": "en-US" } });
  expect(fetch).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({
    headers: expect.objectContaining({ "x-locale": "en-US" }),
  }));
  expect((jest.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>)["X-Locale"]).toBeUndefined();
  await requestWithAuth("https://example.test/file", { includePlatformAuth: false });
  expect(fetch).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ headers: {} }));
});
