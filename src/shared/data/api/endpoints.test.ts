import {
  buildAccessLevelPayload,
  buildAttachPayload,
  buildBTWPayload,
  buildQueryPayload,
  buildRunControlPayload,
  buildRunSubmitPayload,
} from "@/shared/data/api/endpoints";

describe("endpoint payload builders", () => {
  it("builds the minimal Agent query payload", () => {
    expect(buildQueryPayload({
      requestId: "req_1",
      message: "显示广州的天气",
      owner: { kind: "agent", agentKey: "demo-agent" },
    })).toEqual({
      requestId: "req_1",
      message: "显示广州的天气",
      agentKey: "demo-agent",
    });
  });

  it("normalizes required skills while preserving references and business params", () => {
    expect(buildQueryPayload({
      requestId: "req_context",
      message: "Use the selected context",
      owner: { kind: "agent", agentKey: "demo-agent" },
      mustUseSkills: [" product-design ", "PRODUCT-DESIGN"],
      references: [
        { type: "chat", id: "chat_2", name: "Previous design" },
        { type: "site", id: "website:docs", url: "https://example.com" },
      ],
      params: { editingMode: true, topic: "guide" },
    })).toEqual({
      requestId: "req_context",
      message: "Use the selected context",
      agentKey: "demo-agent",
      mustUseSkills: ["product-design"],
      references: [
        { type: "chat", id: "chat_2", name: "Previous design" },
        { type: "site", id: "website:docs", url: "https://example.com" },
      ],
      params: { topic: "guide" },
    });
  });

  it("emits planning and editing flags only for their matching Agent modes", () => {
    expect(buildQueryPayload({
      requestId: "req_coder",
      message: "plan",
      owner: { kind: "agent", agentKey: "coder" },
      agentMode: "CODER",
      planningMode: false,
    })).toEqual({
      requestId: "req_coder",
      message: "plan",
      agentKey: "coder",
      planningMode: false,
    });
    expect(buildQueryPayload({
      requestId: "req_kbase",
      message: "edit",
      owner: { kind: "agent", agentKey: "knowledge" },
      agentMode: "KBASE",
      planningMode: true,
      editingMode: true,
    })).toEqual({
      requestId: "req_kbase",
      message: "edit",
      agentKey: "knowledge",
      editingMode: true,
    });
    expect(buildQueryPayload({
      requestId: "req_react",
      message: "run",
      owner: { kind: "agent", agentKey: "react" },
      agentMode: "REACT",
      planningMode: true,
      editingMode: true,
    })).toEqual({
      requestId: "req_react",
      message: "run",
      agentKey: "react",
    });
  });

  it("normalizes query model overrides and preserves BTW MAX effort", () => {
    expect(buildQueryPayload({
      requestId: "req_model",
      message: "continue",
      owner: { kind: "agent", agentKey: "demo-agent" },
      accessLevel: "auto_approve",
      model: {
        key: "gpt-5.5",
        reasoningEffort: "EXTRA_HIGH" as never,
        serviceTier: "STANDARD",
      },
    })).toEqual({
      requestId: "req_model",
      message: "continue",
      agentKey: "demo-agent",
      accessLevel: "auto_approve",
      model: { key: "gpt-5.5", reasoningEffort: "XHIGH" },
    });
    expect(buildBTWPayload({
      requestId: "req_btw",
      chatId: "chat_1",
      message: "side question",
      model: { reasoningEffort: "MAX" },
    })).toMatchObject({
      model: { reasoningEffort: "MAX" },
    });
  });

  it("keeps BTW payloads scoped to their parent Chat", () => {
    const payload = buildBTWPayload({
      requestId: "req_btw_1",
      runId: "run_btw_1",
      chatId: "chat_1",
      btwId: "btw_1",
      message: "side question",
      references: [{ name: "spec.md" }],
      accessLevel: "default",
      stream: true,
    });
    expect(payload).toEqual({
      requestId: "req_btw_1",
      runId: "run_btw_1",
      chatId: "chat_1",
      btwId: "btw_1",
      message: "side question",
      references: [{ name: "spec.md" }],
      accessLevel: "default",
      stream: true,
    });
    expect(payload).not.toHaveProperty("agentKey");
    expect(payload).not.toHaveProperty("teamId");
    expect(payload).not.toHaveProperty("planningMode");
  });

  it("serializes Agent and Team owners without mixing routing keys", () => {
    const teamQuery = buildQueryPayload({
      requestId: "req_team",
      chatId: "chat_team",
      message: "delegate",
      owner: { kind: "orchestrated-team", teamId: "team_1" },
    });
    expect(teamQuery).toEqual({
      requestId: "req_team",
      chatId: "chat_team",
      message: "delegate",
      teamId: "team_1",
    });
    expect(teamQuery).not.toHaveProperty("agentKey");

    expect(buildAttachPayload({
      runId: " run_team ",
      owner: { kind: "orchestrated-team", teamId: "team_1" },
      lastSeq: -2,
    })).toEqual({ runId: "run_team", teamId: "team_1", lastSeq: 0 });

    const controlPayload = buildRunControlPayload({
      requestId: "req_steer",
      chatId: "chat_1",
      runId: "run_1",
      steerId: "steer_1",
      owner: { kind: "agent", agentKey: "agent_1" },
      message: "continue",
    });
    expect(controlPayload).toEqual({
      requestId: "req_steer",
      chatId: "chat_1",
      runId: "run_1",
      steerId: "steer_1",
      agentKey: "agent_1",
      message: "continue",
    });
    expect(controlPayload).not.toHaveProperty("teamId");
  });

  it("builds submit and access-level payloads through the shared owner serializer", () => {
    expect(buildRunSubmitPayload({
      chatId: "chat_team",
      runId: "run_team",
      owner: { kind: "orchestrated-team", teamId: "team_1" },
      awaitingId: "await_1",
      submitId: "submit_1",
      params: [],
    })).toEqual({
      chatId: "chat_team",
      runId: "run_team",
      teamId: "team_1",
      awaitingId: "await_1",
      submitId: "submit_1",
      params: [],
    });
    expect(buildAccessLevelPayload({
      requestId: "req_access",
      runId: "run_1",
      owner: { kind: "agent", agentKey: "agent_1" },
      accessLevel: "full_access",
      reason: "approved",
    })).toEqual({
      requestId: "req_access",
      runId: "run_1",
      agentKey: "agent_1",
      accessLevel: "full_access",
      reason: "approved",
    });
  });
});
