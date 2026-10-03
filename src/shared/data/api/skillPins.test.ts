import { configureI18nRuntime, getI18nRuntimeConfig } from "@/shared/i18n/runtime";

import { dataQueryCache } from "@/shared/data/query/serverState";
import { getAgentSkills, putAgentSkillPin } from "@/shared/data";
import { requestJson } from "@/shared/data/api/http";
import { requestDataThroughExecutor } from "@/shared/data/api/dataRequestExecutor";
import { getBackendMode } from "@/shared/config/backendMode";

const originalI18n = getI18nRuntimeConfig();
beforeEach(() => { configureI18nRuntime({ locale: "en-US" }); });
afterEach(() => { configureI18nRuntime(originalI18n); });

jest.mock("@/shared/data/api/http", () => ({
  ...jest.requireActual("@/shared/data/api/http"),
  requestJson: jest.fn(),
}));
jest.mock("@/shared/data/api/dataRequestExecutor", () => ({ requestDataThroughExecutor: jest.fn() }));
jest.mock("@/shared/config/backendMode", () => ({
  ...jest.requireActual("@/shared/config/backendMode"),
  getBackendMode: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  dataQueryCache.clear();
  jest.mocked(requestJson).mockResolvedValue({ code: 0, msg: "", data: { agentKey: "", skills: [], pinned: [] } });
});

it("routes user-level pin reads and writes through the Platform WebSocket", async () => {
  jest.mocked(getBackendMode).mockReturnValue("platform");
  const response = { code: 0, msg: "success", data: { agentKey: "", skills: [], pinned: ["pdf"] } };
  jest.mocked(requestDataThroughExecutor).mockResolvedValue(response);
  await expect(getAgentSkills()).resolves.toEqual(response);
  await expect(putAgentSkillPin({ id: "pdf", pinned: true })).resolves.toEqual(response);
  expect(requestDataThroughExecutor).toHaveBeenNthCalledWith(1, "/api/skills", { agentKey: "", locale: "en-US" });
  expect(requestDataThroughExecutor).toHaveBeenNthCalledWith(2, "/api/skills", { id: "pdf", pinned: true, locale: "en-US" });
  expect(requestJson).not.toHaveBeenCalled();
});

it("uses uncached HTTP reads and PUT without Agent or user overrides in gateway mode", async () => {
  jest.mocked(getBackendMode).mockReturnValue("gateway");
  await getAgentSkills();
  await putAgentSkillPin({ id: "pdf", pinned: false });
  expect(requestJson).toHaveBeenNthCalledWith(1, "/api/skills", { cache: "no-store" });
  expect(requestJson).toHaveBeenNthCalledWith(2, "/api/skills", {
    method: "PUT", body: '{"id":"pdf","pinned":false}',
  });
  expect(requestDataThroughExecutor).not.toHaveBeenCalled();
});
