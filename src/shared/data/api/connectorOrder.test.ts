import { getConnectorOrder, putConnectorOrder } from "@/shared/data";
import { requestJson } from "@/shared/data/api/http";
import { requestDataThroughExecutor } from "@/shared/data/api/dataRequestExecutor";
import { getBackendMode } from "@/shared/config/backendMode";

jest.mock("@/shared/data/api/http", () => ({
  ...jest.requireActual("@/shared/data/api/http"),
  requestJson: jest.fn(),
}));
jest.mock("@/shared/data/api/dataRequestExecutor", () => ({ requestDataThroughExecutor: jest.fn() }));
jest.mock("@/shared/config/backendMode", () => ({
  ...jest.requireActual("@/shared/config/backendMode"),
  getBackendMode: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

it("routes user-level pin reads and writes through the Platform WebSocket", async () => {
  jest.mocked(getBackendMode).mockReturnValue("platform");
  const response = { code: 0, msg: "success", data: { version: 1, order: ["demo"] } };
  jest.mocked(requestDataThroughExecutor).mockResolvedValue(response);
  await expect(getConnectorOrder()).resolves.toEqual(response);
  await expect(putConnectorOrder({ key: "demo", pinned: true })).resolves.toEqual(response);
  expect(requestDataThroughExecutor).toHaveBeenNthCalledWith(1, "/api/connectors/order", undefined);
  expect(requestDataThroughExecutor).toHaveBeenNthCalledWith(2, "/api/connectors/order", { key: "demo", pinned: true });
  expect(requestJson).not.toHaveBeenCalled();
});

it("uses uncached HTTP reads and PUT without Agent or user overrides in gateway mode", async () => {
  jest.mocked(getBackendMode).mockReturnValue("gateway");
  await getConnectorOrder();
  await putConnectorOrder({ key: "demo", pinned: false });
  expect(requestJson).toHaveBeenNthCalledWith(1, "/api/connectors/order", { cache: "no-store" });
  expect(requestJson).toHaveBeenNthCalledWith(2, "/api/connectors/order", {
    method: "PUT", body: '{"key":"demo","pinned":false}',
  });
  expect(requestDataThroughExecutor).not.toHaveBeenCalled();
});
