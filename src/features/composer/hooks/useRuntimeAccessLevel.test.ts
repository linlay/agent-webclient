import {
  applyRuntimeAccessLevelChange,
} from "@/features/composer/hooks/useRuntimeAccessLevel";
import { enUSMessages } from "@/shared/i18n/locales/en-US";
import type { QueryAccessLevel } from "@/shared/api/apiClient";

describe("applyRuntimeAccessLevelChange", () => {
  const t = (key: string, params: Record<string, unknown> = {}) =>
    String(enUSMessages[key] || key).replace(/\{([^}]+)\}/g, (_, name) =>
      String(params[name] ?? ""),
    );

  it("rolls back and warns when the active run rejects the access level", async () => {
    const setAccessLevel = jest.fn();
    const messageApi = {
      warning: jest.fn(),
      error: jest.fn(),
    };
    const updateAccessLevel = jest.fn().mockResolvedValue({
      data: {
        accepted: false,
        status: "rejected",
        runId: "run_1",
        previousAccessLevel: "default",
        accessLevel: "full_access",
        version: 2,
        detail: "not supported by this run",
      },
    });

    await applyRuntimeAccessLevelChange({
      previousAccessLevel: "default",
      nextAccessLevel: "full_access",
      activeRunId: "run_1",
      activeRunAgentKey: "agent_a",
      setAccessLevel,
      messageApi,
      t,
      requestIdFactory: () => "access_1",
      updateAccessLevel,
    });

    expect(setAccessLevel).toHaveBeenNthCalledWith(1, "full_access");
    expect(setAccessLevel).toHaveBeenNthCalledWith(2, "default");
    expect(messageApi.warning).toHaveBeenCalledWith(
      "The current run did not accept the access change (not supported by this run). Reverted to the previous value.",
    );
    expect(messageApi.error).not.toHaveBeenCalled();
  });

  it("rolls back and shows an English error when the request fails", async () => {
    const setAccessLevel = jest.fn();
    const messageApi = {
      warning: jest.fn(),
      error: jest.fn(),
    };

    await applyRuntimeAccessLevelChange({
      previousAccessLevel: "auto_approve",
      nextAccessLevel: "full_access",
      activeRunId: "run_1",
      activeRunAgentKey: "agent_a",
      setAccessLevel,
      messageApi,
      t,
      requestIdFactory: () => "access_1",
      updateAccessLevel: jest.fn().mockRejectedValue(new Error("network down")),
    });

    expect(setAccessLevel).toHaveBeenNthCalledWith(1, "full_access");
    expect(setAccessLevel).toHaveBeenNthCalledWith(2, "auto_approve");
    expect(messageApi.error).toHaveBeenCalledWith(
      "Access level update failed: network down",
    );
  });

  it("only updates local state before a run starts", async () => {
    const setAccessLevel = jest.fn();
    const updateAccessLevel = jest.fn();
    const nextAccessLevel: QueryAccessLevel = "auto_approve";

    await applyRuntimeAccessLevelChange({
      previousAccessLevel: "default",
      nextAccessLevel,
      activeRunId: "",
      activeRunAgentKey: "",
      setAccessLevel,
      messageApi: {
        warning: jest.fn(),
        error: jest.fn(),
      },
      t,
      updateAccessLevel,
    });

    expect(setAccessLevel).toHaveBeenCalledWith(nextAccessLevel);
    expect(updateAccessLevel).not.toHaveBeenCalled();
  });
});
