/** Tool identity only: translated labels and connector prefixes must not select builtin icons. */
const TOOL_ICONS: Readonly<Record<string, TimelineToolIconKind>> = {
  wait: "wait",
  catalog_query: "read",
  catalog_manage: "edit",
  chat_query: "read",
  chat_manage: "edit",
  platform_inspect: "read",
  run_env: "run",
  image_generate: "image",
  file_read: "read",
  file_write: "write",
  file_edit: "edit",
  file_glob: "glob",
  file_grep: "grep",
  vision_recognize: "vision",
  web_fetch: "web",
  bash: "bash",
  bash_sandbox: "bash",
  _sandbox_bash_: "bash",
  desktop_shell: "desktop",
  desktop_settings: "desktop",
  desktop_site: "desktop",
  desktop_webapp: "desktop",
  desktop_service: "desktop",
  desktop_market: "desktop",
  desktop_kanban: "desktop",
  desktop_action: "desktop",
  desktop_cdp: "browser",
  plan_add_tasks: "plan",
  plan_get_tasks: "plan",
  plan_update_task: "plan",
  finalize_planning: "plan",
  ask_user_question: "question",
  agent_invoke: "agent",
  agent_delegate: "agent",
  run_query: "run",
  run_status: "run",
  run_interrupt: "run",
  artifact_publish: "publish",
  datetime: "datetime",
  regex: "regex",
};

export type TimelineToolIconKind = "wait" | "read" | "write" | "edit" | "glob" | "grep" | "web" | "desktop" | "question" | "run" | "publish" | "datetime" | "regex" | "fallback" | "image" | "bash" | "vision" | "browser" | "plan" | "agent";

export function resolveTimelineToolIcon(toolNames: readonly (string | null | undefined)[]): TimelineToolIconKind {
  const icons = toolNames.map((name) => {
    const key = name?.trim().toLowerCase() || "";
    return Object.prototype.hasOwnProperty.call(TOOL_ICONS, key) ? TOOL_ICONS[key] : "fallback";
  });
  const first = icons[0];
  return first && icons.every((icon) => icon === first) ? first : "fallback";
}
