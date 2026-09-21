const fs = require("node:fs");
const path = require("node:path");
const START = 1_700_000_000_000;
const localSnapshotPath = path.resolve(
  __dirname,
  "../.local/share-preview/current.snapshot.json",
);

function localSnapshot() {
  if (!fs.existsSync(localSnapshotPath)) return fixture;
  const raw = fs.readFileSync(localSnapshotPath, "utf8");
  if (Buffer.byteLength(raw) > 20 * 1024 * 1024)
    throw new Error("Local preview snapshot exceeds 20 MiB.");
  const snapshot = JSON.parse(raw);
  if (snapshot.version !== 1) {
    throw new Error(
      "当前本地快照不符合 Snapshot V1；请从原对话重新生成。可用 ?case=example 查看示例。",
    );
  }
  return snapshot;
}

const fixture = {
  version: 1,
  title: "统一对话预览 V2 示例",
  locale: "zh-CN",
  createdAt: START,
  capturedAt: START + 500_000,
  attachments: [],
  turns: [
    {
      runId: "example-run",
      queryAt: START + 1_000,
      startedAt: START + 1_050,
      endedAt: START + 457_000,
      outcome: "completed",
      assistant: { name: "方案助手", iconName: "chat" },
      nodes: [
        {
          id: "example-query",
          kind: "message",
          role: "user",
          runId: "example-run",
          at: START + 1_000,
          text: "请给出实施方案。",
        },
        {
          id: "example-thinking",
          kind: "thinking",
          role: "assistant",
          runId: "example-run",
          at: START + 2_000,
          text: "先检查现有的组件和数据契约。",
          reasoningLabel: "分析需求",
        },
        {
          id: "example-tool",
          kind: "tool",
          role: "assistant",
          runId: "example-run",
          at: START + 3_000,
          toolId: "tool-1",
          toolName: "file_read",
          argsText: '{"path":"README.md"}',
          resultText: "found",
          status: "success",
          startedAt: START + 3_000,
          endedAt: START + 4_000,
          durationMs: 1_000,
        },
        {
          id: "example-answer",
          kind: "content",
          role: "assistant",
          runId: "example-run",
          at: START + 5_000,
          text: "## 实施方案\n\n统一使用 ConversationStage。\n\n| 阶段 | 内容 |\n| --- | --- |\n| 一 | 组件复用 |\n\n\x60\x60\x60ts\nconst ready = true;\n\x60\x60\x60",
        },
      ],
    },
  ],
};

module.exports = {
  get default() {
    return localSnapshot();
  },
  example: fixture,
};
