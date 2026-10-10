import {
  automationExecutionDurationLabel,
  automationExecutionPreview,
  automationExecutionTimeLabel,
  groupAutomationExecutions,
  mergeAutomationExecutionPages,
} from "./executionView";
import type { AutomationExecutionResponse } from "@/shared/data";

function execution(
  id: string,
  startedTime: string,
  patch: Partial<AutomationExecutionResponse> = {},
): AutomationExecutionResponse {
  return {
    id,
    automationId: "daily",
    automationName: "Daily",
    sourceFile: "daily.yml",
    agentKey: "",
    status: "success",
    error: "",
    zoneId: "Asia/Shanghai",
    hasResult: true,
    resultPreview: `result-${id}`,
    startedAt: Date.parse(`${startedTime.replace(" ", "T")}+08:00`),
    startedTime,
    ...patch
  };
}

describe("automation execution view helpers", () => {
  it("formats compact time and duration labels", () => {
    const item = execution("one", "2026-08-25 09:30:15");
    expect(automationExecutionTimeLabel(item, "zh-CN")).toBe("09:30");
    expect(automationExecutionDurationLabel(420)).toBe("420ms");
    expect(automationExecutionDurationLabel(5420)).toBe("5.4s");
  });

  it("uses result, error, and status fallbacks in that order", () => {
    const fallback = { running: "running", empty: "empty" };
    expect(automationExecutionPreview(execution("one", "2026-08-25 09:30:15"), fallback)).toBe("result-one");
    expect(automationExecutionPreview(execution("two", "2026-08-25 09:20:15", {
      hasResult: false,
      resultPreview: "",
      error: "model failed",
    status: "failed"
    }), fallback)).toBe("model failed");
    expect(automationExecutionPreview(execution("three", "2026-08-25 09:10:15", {
      hasResult: false,
      resultPreview: "",
    status: "running"
    }), fallback)).toBe("running");
  });

  it("groups by platform-readable date and deduplicates pages", () => {
    const newest = execution("new", "2026-08-25 09:30:15");
    const older = execution("old", "2026-08-24 09:30:15");
    const merged = mergeAutomationExecutionPages([older], [newest, older], false);
    expect(merged.map((item) => item.id)).toEqual(["new", "old"]);
    expect(groupAutomationExecutions(merged, {
      locale: "zh-CN",
      todayLabel: "今天",
      yesterdayLabel: "昨天",
    now: new Date("2026-08-25T12:00:00+08:00")
    }).map((group) => group.label)).toEqual(["今天", "昨天"]);
  });
});
