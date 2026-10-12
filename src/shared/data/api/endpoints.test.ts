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
    const options = {requestId: "req_interaction", message: "hello", owner: { kind: "agent" as const, agentKey: "demo-agent" }, interactionConfig: {
        model: true, accessLevel: true, mustUseSkills: true, connectors: true,
        attachment: { localFiles: true, chatRecords: true }
      }, model: { key: "selected-model" }, accessLevel: "default", references: [...(["selected-skill"] || []).map(id => ({type:"skill",id}))]};
    expect(buildQueryPayload(options)).toEqual({requestId: "req_interaction", message: "hello", agentKey: "demo-agent", model: { key: "selected-model" }, accessLevel: "default", references: [...(["selected-skill"] || []).map(id => ({type:"skill",id}))]});
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
    expect(buildQueryPayload({requestId: "req_context", message: "Use the selected context", owner: { kind: "agent", agentKey: "demo-agent" }, params: { editingMode: true, topic: "guide" }, references: [...([
        { type: "chat", id: "chat_2", name: "Previous design" },
        { type: "site", id: "website:docs", url: "https://example.com" },
      ]), ...([" product-design ", "PRODUCT-DESIGN"] || []).map(id => ({type:"skill",id}))]})).toEqual({requestId: "req_context", message: "Use the selected context", agentKey: "demo-agent", params: { topic: "guide" }, references: [...([
        { type: "chat", id: "chat_2" },
        { type: "site", id: "website:docs", url: "https://example.com" },
      ]), ...(["product-design"] || []).map(id => ({type:"skill",id}))]});
  });

  it("sends planningMode only when it is on, for every agent", () => {
    const base = { requestId: "req", message: "plan", owner: { kind: "agent" as const, agentKey: "demo" } };
    expect(buildQueryPayload({ ...base, planningMode: true })).toMatchObject({ planningMode: true });
    expect(buildQueryPayload({ ...base, planningMode: false })).not.toHaveProperty("planningMode");
    expect(buildQueryPayload(base)).not.toHaveProperty("planningMode");
  });

  it("preserves both Workspace editing choices and omits an unset one", () => {
    const base = { requestId: "req", message: "run", owner: { kind: "agent" as const, agentKey: "demo" } };
    for (const editingMode of [true, false]) {
      expect(buildQueryPayload({ ...base, editingMode })).toMatchObject({ editingMode });
    }
    expect(buildQueryPayload(base)).not.toHaveProperty("editingMode");
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

it("normalizes library pointers at the query root and snapshots them", () => {
 const libraries = [" lib-a ", "lib-b", "lib-a"];
 const payload = buildQueryPayload({requestId:"request",message:"hello",owner:{kind:"agent",agentKey:"general"},references:libraries.map(id=>({type:"kbase",id}))});
 libraries.push("later");
 expect(payload.references).toEqual([{type:"kbase",id:"lib-a"},{type:"kbase",id:"lib-b"}]);
 expect(payload).not.toHaveProperty("mustUseKbases"); expect(payload).not.toHaveProperty("params");
 expect(buildQueryPayload({requestId:"request",message:"hello",owner:{kind:"agent",agentKey:"general"},references:[]})).toHaveProperty("references", []);
});
