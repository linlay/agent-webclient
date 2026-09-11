import {
  AUTOMATION_CRON_PRESETS,
  automationSourcePath,
  buildCreateAutomationPayloadForSubmit,
  buildDuplicateAutomationPayload,
  buildUpdateAutomationPayloadForSubmit,
  isCurrentAutomationSourceRequest,
  splitAutomationCronExpression,
  validateAutomationForm,
  type AutomationFormState,
} from "@/features/automations/lib/automationForm";

const form: AutomationFormState = {
  id: "daily-demo",
  name: "Daily demo",
  description: "Run daily",
  cron: "0 9 * * *",
  agentKey: "agent-a",
  teamId: "team-a",
  zoneId: "Asia/Shanghai",
  remainingRuns: "3",
  enabled: true,
  message: "Summarize status",
  chatMode: "new",
  chatId: "chat-stale",
  role: "assistant",
  hidden: "",
  paramsText: "",
};

describe("automationForm", () => {
  it("builds create and update DTOs without the legacy TeamID", () => {
    expect(buildCreateAutomationPayloadForSubmit(form)).toMatchObject({
      name: "Daily demo",
      agentKey: "agent-a",
      zoneId: "Asia/Shanghai",
      remainingRuns: 3,
      query: { message: "Summarize status", role: "assistant" },
    });
    expect(buildCreateAutomationPayloadForSubmit(form)).not.toHaveProperty(
      "teamId",
    );
    expect(buildUpdateAutomationPayloadForSubmit(form)).toMatchObject({
      id: "daily-demo",
      description: "Run daily",
    });
  });

  it("only sends ChatId for the existing-chat mode", () => {
    expect(buildCreateAutomationPayloadForSubmit(form).query).not.toHaveProperty(
      "chatId",
    );
    expect(
      buildCreateAutomationPayloadForSubmit({
        ...form,
        chatMode: "existing",
      }).query,
    ).toMatchObject({ chatId: "chat-stale" });
  });

  it("validates structured drafts before DTO conversion", () => {
    const t = (key: string) => key;
    expect(validateAutomationForm(form, t)).toBe("");
    expect(validateAutomationForm({ ...form, cron: "0 9" }, t)).toBe(
      "automationConsole.error.cronFormat",
    );
    expect(
      validateAutomationForm({ ...form, paramsText: "[]" }, t),
    ).toBe("automationConsole.error.paramsObject");
  });

  it("preserves duplicate ownership/query and disables the copy", () => {
    expect(
      buildDuplicateAutomationPayload(
        {
          id: "team-report",
          name: "团队日报",
          description: "生成日报",
          cron: "0 18 * * 1-5",
          teamId: "team-a",
          enabled: true,
          query: { message: "生成今天的日报", hidden: true },
        },
        "团队日报 副本",
      ),
    ).toMatchObject({
      name: "团队日报 副本",
      teamId: "team-a",
      enabled: false,
      query: { message: "生成今天的日报", hidden: true },
    });
  });

  it("normalizes source filenames and protects late source responses", () => {
    const automation = {
      id: "sync-workspace",
      name: "Sync",
      cron: "0 9 * * *",
      enabled: true,
      sourceFile: "/repo/automations/sync-workspace.yml",
    };
    expect(automationSourcePath(automation)).toBe("sync-workspace.yml");
    expect(isCurrentAutomationSourceRequest(3, 3, "daily", "daily")).toBe(
      true,
    );
    expect(isCurrentAutomationSourceRequest(3, 4, "daily", "daily")).toBe(
      false,
    );
  });

  it("splits cron fields exactly and keeps the one-shot preset", () => {
    expect(splitAutomationCronExpression("0 9 * * 1-5")).toEqual([
      "0",
      "9",
      "*",
      "*",
      "1-5",
    ]);
    expect(splitAutomationCronExpression("0  9 * *")).toEqual([
      "0",
      "",
      "9",
      "*",
      "*",
    ]);
    expect(
      AUTOMATION_CRON_PRESETS.find(({ value }) => value === "10 22 * * *")
        ?.remainingRuns,
    ).toBe("1");
  });
});
