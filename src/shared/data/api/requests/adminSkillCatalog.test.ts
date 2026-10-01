import { getAdminSkills, putAdminSkillPin } from "./skills";
import { requestJson } from "../http";
import { configureDataRequestExecutor } from "../dataRequestExecutor";
import { dataEndpoints } from "../endpoints";
jest.mock("../http", () => ({ requestJson: jest.fn(), postJson: jest.fn() }));
it("reads and writes the management catalog exclusively over HTTP", async () => {
  const websocket = jest.fn();
  configureDataRequestExecutor(websocket);
  const read = { code: 0, msg: "", data: { skills: [], packages: [], pinned: [] } };
  const write = { code: 0, msg: "", data: { pinned: ["office"] } };
  jest.mocked(requestJson).mockResolvedValueOnce(read).mockResolvedValueOnce(write);
  expect(await getAdminSkills()).toBe(read);
  expect(await putAdminSkillPin({ id: "office", pinned: true })).toBe(write);
  expect(requestJson).toHaveBeenNthCalledWith(1, "/api/admin/skills");
  expect(requestJson).toHaveBeenNthCalledWith(2, "/api/admin/skills/pin", { method: "PUT", body: '{"id":"office","pinned":true}' });
  expect(dataEndpoints.adminSkills.transport).toBe("http");
  expect(dataEndpoints.adminSkillPinUpdate.transport).toBe("http");
  expect(websocket).not.toHaveBeenCalled();
});
