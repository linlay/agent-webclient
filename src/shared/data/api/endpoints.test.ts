import {
  buildAccessLevelPayload,
  buildAttachPayload,
  buildBTWPayload,
  buildQueryPayload,
  buildRunControlPayload,
  buildRunSubmitPayload,
} from "@/shared/data/api/endpoints";

describe("endpoint payload builders", () => {
  it("keeps Agent interaction capabilities out of query payloads", () => {
    const options = {
      requestId: "req_interaction",
      message: "hello",
      owner: { kind: "agent" as const, agentKey: "demo-agent" },
      interactionConfig: {
        model: true, accessLevel: true, mustUseSkills: true, connectors: true,
        attachment: { localFiles: true, chatRecords: true }
      },
      model: { key: "selected-model" },
      accessLevel: "default",
    mustUseSkills: ["selected-skill"]
    };
    expect(buildQueryPayload(options)).toEqual({
      requestId: "req_interaction",
      message: "hello",
      agentKey: "demo-agent",
      model: { key: "selected-model" },
      accessLevel: "default",
    mustUseSkills: ["selected-skill"]
    });
  });

  it("builds the minimal Agent query payload", () => {
    expect(buildQueryPayload({
      requestId: "req_1",
      message: "显示广州的天气",
    owner: { kind: "agent", agentKey: "demo-agent" }
    })).toEqual({
      requestId: "req_1",
      message: "显示广州的天气",
    agentKey: "demo-agent"
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
    params: { editingMode: true, topic: "guide" }
    })).toEqual({
      requestId: "req_context",
      message: "Use the selected context",
      agentKey: "demo-agent",
      mustUseSkills: ["product-design"],
      references: [
        { type: "chat", id: "chat_2", name: "Previous design" },
        { type: "site", id: "website:docs", url: "https://example.com" },
      ],
    params: { topic: "guide" }
    });
  });

  it("retains the existing planning flag contract", () => {
    expect(buildQueryPayload({
      requestId: "req_coder",
      message: "plan",
      owner: { kind: "agent", agentKey: "coder" },
      agentMode: "CODER",
    planningMode: false
    })).toEqual({
      requestId: "req_coder",
      message: "plan",
      agentKey: "coder",
    planningMode: false
    });
    expect(buildQueryPayload({
      requestId: "req_kbase",
      message: "edit",
      owner: { kind: "agent", agentKey: "knowledge" },
      agentMode: "KBASE",
      planningMode: true,
    editingMode: true
    })).toEqual({
      requestId: "req_kbase",
      message: "edit",
      agentKey: "knowledge",
    editingMode: true
    });
    expect(buildQueryPayload({
      requestId: "req_react",
      message: "run",
      owner: { kind: "agent", agentKey: "react" },
      agentMode: "REACT",
      planningMode: true,
    editingMode: true
    })).toEqual({
      requestId: "req_react",
      message: "run",
    agentKey: "react",
    editingMode: true
    });
  });

  it.each(["GENERAL", "CODER", "KBASE", "TEAM"])("preserves both Workspace editing choices for %s", (agentMode) => {
    for (const editingMode of [true, false]) {
      expect(buildQueryPayload({ requestId: "req", message: "run", owner: {kind: "agent", agentKey: "demo"}, agentMode, editingMode })).toMatchObject({ editingMode });
    }
    expect(buildQueryPayload({ requestId: "req", message: "run", owner: {kind: "agent", agentKey: "demo"}, agentMode })).not.toHaveProperty("editingMode");
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
        serviceTier: "STANDARD"
    }
    })).toEqual({
      requestId: "req_model",
      message: "continue",
      agentKey: "demo-agent",
      accessLevel: "auto_approve",
    model: { key: "gpt-5.5", reasoningEffort: "XHIGH" }
    });
    expect(buildBTWPayload({
      requestId: "req_btw",
      chatId: "chat_1",
      message: "side question",
    model: { reasoningEffort: "MAX" }
    })).toMatchObject({
    model: { reasoningEffort: "MAX" }
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
    stream: true
    });
    expect(payload).toEqual({
      requestId: "req_btw_1",
      runId: "run_btw_1",
      chatId: "chat_1",
      btwId: "btw_1",
      message: "side question",
      references: [{ name: "spec.md" }],
      accessLevel: "default",
    stream: true
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
    owner: {kind: "agent", agentKey: "team_1"}
    });
    expect(teamQuery).toEqual({
      requestId: "req_team",
      chatId: "chat_team",
      message: "delegate",
    agentKey: "team_1"
    });
    expect(teamQuery.agentKey).toBe("team_1");

    expect(buildAttachPayload({
      runId: " run_team ",
    owner: {kind: "agent", agentKey: "team_1"},
    lastSeq: -2
})).toEqual({ runId: "run_team", agentKey: "team_1", lastSeq: 0 });

    const controlPayload = buildRunControlPayload({
      requestId: "req_steer",
      chatId: "chat_1",
      runId: "run_1",
      steerId: "steer_1",
      owner: { kind: "agent", agentKey: "agent_1" },
    message: "continue"
    });
    expect(controlPayload).toEqual({
      requestId: "req_steer",
      chatId: "chat_1",
      runId: "run_1",
      steerId: "steer_1",
      agentKey: "agent_1",
    message: "continue"
    });
    expect(controlPayload).not.toHaveProperty("teamId");
  });

  it("builds submit and access-level payloads through the shared owner serializer", () => {
    expect(buildRunSubmitPayload({
      chatId: "chat_team",
      runId: "run_team",
    owner: {kind: "agent", agentKey: "team_1"},
      awaitingId: "await_1",
      submitId: "submit_1",
    params: []
    })).toEqual({
      chatId: "chat_team",
      runId: "run_team",
    agentKey: "team_1",
      awaitingId: "await_1",
      submitId: "submit_1",
    params: []
    });
    expect(buildAccessLevelPayload({
      requestId: "req_access",
      runId: "run_1",
      owner: { kind: "agent", agentKey: "agent_1" },
      accessLevel: "full_access",
    reason: "approved"
    })).toEqual({
      requestId: "req_access",
      runId: "run_1",
      agentKey: "agent_1",
      accessLevel: "full_access",
    reason: "approved"
    });
  });
});

it('includes uploaded references in the steer control payload', () => {
  const references = [{ type: 'file', name: 'image.png', url: 'image.png', mimeType: 'image/png' }];
  expect(buildRunControlPayload({ requestId: 'req-image', runId: 'run-image', steerId: 'steer-image',
    owner: { kind: 'agent', agentKey: 'agent-a' }, message: 'look', references })).toEqual(expect.objectContaining({ references }));
});

it("keeps required library IDs at the query root and snapshots arrays", () => {
 const libraries = [" lib-a ", "lib-b", "lib-a"];
 const payload = buildQueryPayload({requestId: "request", message: "hello", owner: {kind: "agent", agentKey: "general"}, mustUseKbases: libraries});
 libraries.push("later");
 expect(payload.mustUseKbases).toEqual(["lib-a", "lib-b"]);
 expect(payload).not.toHaveProperty("params"); expect(payload).not.toHaveProperty("references");
 expect(buildQueryPayload({requestId: "request", message: "hello", owner: {kind: "agent", agentKey: "general"}, mustUseKbases: []}).mustUseKbases).toEqual([]);
});
