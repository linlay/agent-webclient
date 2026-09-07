import { getAdminConnectors, getConnectorDefinition, updateConnectorDefinition } from "./connectors";
import { requestJson } from "@/shared/data/api/http";
jest.mock("@/shared/data/api/http", () => ({
  ...jest.requireActual("@/shared/data/api/http"),
  requestJson: jest.fn(),
}));

it("uses installed connector APIs with file identity and a required base hash", async () => {
  await getAdminConnectors();
  await getConnectorDefinition({ id: "builtin.dbx", file: "cli.json" });
  const input = { id: "builtin.dbx", file: "cli.json" as const, content: '{"versionCheck":"dbx --version"}', baseSha256: "original-sha" };
  await updateConnectorDefinition(input);
  expect(requestJson).toHaveBeenNthCalledWith(1, "/api/admin/connectors");
  expect(requestJson).toHaveBeenNthCalledWith(2, "/api/admin/connectors/detail?id=builtin.dbx&file=cli.json");
  expect(requestJson).toHaveBeenNthCalledWith(3, "/api/admin/connectors/detail", { method: "PUT", body: JSON.stringify(input) });
});
