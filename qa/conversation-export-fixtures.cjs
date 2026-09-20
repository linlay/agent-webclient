const START = 1_700_000_000_000;

const user = (text, at) => ({ kind: "user", text, at });
const thought = (text, label, at) => ({ kind: "reasoning", text, label, at });
const answer = (text, at) => ({ kind: "assistant", text, at });

function snapshot(title, turns) {
  return {
    version: 1,
    title,
    createdAt: START,
    capturedAt: START + 50_000,
    turns,
  };
}

const fixtures = {
  default: snapshot("分享页本地预览：标题、身份与思考过程", [
    {
      startedAt: START + 1_000,
      endedAt: START + 8_000,
      outcome: "completed",
      assistant: { name: "方案助手", iconName: "chat" },
      items: [
        user("请给出一个简洁的实施方案。", START + 1_000),
        thought("先确认目标与约束。", "分析需求", START + 2_000),
        thought("保留现有分享结构，控制变更范围。", "检查方案", START + 4_000),
        answer("## 实施方案\n\n1. 统一标题与正文宽度。\n2. 展示智能体身份。\n3. 保持两级思考折叠。\n\n| 项目 | 结果 |\n| --- | --- |\n| 桌面 | 清晰 |\n| 手机 | 自适应 |\n\n```ts\nconst ready = true;\n```", START + 7_000),
      ],
    },
    {
      startedAt: START + 10_000,
      endedAt: START + 13_000,
      outcome: "completed",
      assistant: { name: "审核助手", iconName: "unknown-icon" },
      items: [
        user("再检查一下兜底头像。", START + 10_000),
        answer("未知内置图标应显示默认头像。", START + 12_000),
      ],
    },
  ]),
  legacy: snapshot("旧分享：缺少智能体身份", [
    {
      startedAt: START + 1_000,
      endedAt: START + 4_000,
      outcome: "completed",
      items: [
        user("旧快照如何展示？", START + 1_000),
        answer("应显示“助手”和默认头像。", START + 3_000),
      ],
    },
  ]),
  states: snapshot("状态预览：运行、失败、取消", [
    {
      startedAt: START + 1_000,
      endedAt: START + 5_000,
      outcome: "failed",
      assistant: { name: "失败的助手" },
      items: [user("失败状态", START + 1_000), thought("已完成的步骤", "检查", START + 2_000)],
    },
    {
      startedAt: START + 10_000,
      endedAt: START + 13_000,
      outcome: "cancelled",
      assistant: { name: "取消的助手" },
      items: [user("取消状态", START + 10_000), thought("已记录的过程", "执行", START + 11_000)],
    },
    {
      startedAt: START + 20_000,
      outcome: "running",
      assistant: { name: "运行中的助手" },
      items: [user("运行中快照", START + 20_000), thought("正在处理", "思考", START + 21_000)],
    },
  ]),
  long: snapshot("这是一段用于验证窄屏省略、提示和标题布局的很长很长的分享标题", [
    {
      startedAt: START + 1_000,
      endedAt: START + 5_000,
      outcome: "completed",
      assistant: { name: "名称很长的智能体：用于检查多行换行和头像对齐" },
      items: [
        user("请展示较长的思考和正文。", START + 1_000),
        thought("第一段思考。\n\n第二段思考，包含更多内容来检查窄屏排版。", "分析", START + 2_000),
        answer("正文第一段。\n\n正文第二段包含一张表格：\n\n| 列一 | 列二 |\n| --- | --- |\n| 内容 | 更多内容 |", START + 4_000),
      ],
    },
  ]),
};

module.exports = fixtures;
