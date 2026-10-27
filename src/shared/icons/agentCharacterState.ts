export type RunActivityVariant = "general" | "code" | "knowledge" | "team" | "agent" | "executor";
export const RUN_ACTIVITY_EXPRESSIONS = [
  { id: "curious", move: "peek" },
  { id: "focus", move: "work" },
  { id: "ponder", move: "tilt" },
  { id: "scan", move: "inspect" },
  { id: "wink", move: "tilt" },
  { id: "surprise", move: "hop" },
  { id: "round", move: "tilt" },
  { id: "side", move: "peek" },
  { id: "sleepy", move: "drowse" },
  { id: "talk", move: "nod" },
  { id: "proud", move: "tilt" },
  { id: "reading", move: "nod" },
  { id: "compute", move: "tilt" },
  { id: "debug", move: "peek" },
  { id: "verify", move: "nod" },
  { id: "organize", move: "peek" },
  { id: "listen", move: "tilt" },
  { id: "aim", move: "nod" },
  { id: "shy", move: "tilt" },
  { id: "determined", move: "persevere" },
  { id: "bored", move: "peek" },
  { id: "excited", move: "hop" },
] as const;
export type RunActivityExpression = typeof RUN_ACTIVITY_EXPRESSIONS[number]["id"];
export type RunActivityMotion = typeof RUN_ACTIVITY_EXPRESSIONS[number]["move"] | "shake" | "stretch";
export interface RunActivityAppearance { variant: RunActivityVariant; color?: string }
