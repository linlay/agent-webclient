import type { ExecuteRequest } from "@/shared/data/api/dto/execute";
import { exampleSchema } from "./executeForm";

export interface ExecuteExample {
  id: string;
  label: string;
  description: string;
  request: Pick<ExecuteRequest, "message" | "input" | "outputSchema">;
}

const groupedSchema = {
  type: "object",
  properties: {
    totalTasks: { type: "integer", minimum: 0 },
    owners: {
      type: "array",
      items: {
        type: "object",
        properties: {
          owner: { type: "string" },
          taskCount: { type: "integer", minimum: 0 },
          totalHours: { type: "number", minimum: 0 },
          tasks: { type: "array", items: { type: "string" } },
        },
        required: ["owner", "taskCount", "totalHours", "tasks"],
        additionalProperties: false,
      },
    },
  },
  required: ["owners", "totalTasks"],
  additionalProperties: false,
};

// Every preset owns its complete request, so switching examples cannot mix
// one task's message or input with another task's output format.
export function getExecuteExamples(t: (key: string) => string): ExecuteExample[] {
  const members = [
    { id: 1, name: t("execute.examples.data.owner1") },
    { id: 2, name: t("execute.examples.data.owner2") },
  ];
  const tasks = [
    { id: 101, title: t("execute.examples.data.proposal"), ownerId: 1, due: "2026-10-30", completed: false, estimatedHours: 4 },
    { id: 102, title: t("execute.examples.data.budget"), ownerId: 2, due: null, completed: false, estimatedHours: 3 },
    { id: 103, title: t("execute.examples.data.archive"), ownerId: 1, due: "2026-10-23", completed: true, estimatedHours: 1 },
  ];
  return [
    {
      id: "meeting",
      label: t("execute.examples.meeting.label"),
      description: t("execute.examples.meeting.description"),
      request: {
        message: t("execute.examples.meeting.message"),
        input: { projectId: "PRJ-1024", members, tasks },
        outputSchema: exampleSchema,
      },
    },
    {
      id: "owners",
      label: t("execute.examples.owners.label"),
      description: t("execute.examples.owners.description"),
      request: {
        message: t("execute.examples.owners.message"),
        input: {
          projectId: "PRJ-1024", members,
          tasks: [...tasks, { id: 104, title: t("execute.examples.data.demo"), ownerId: 1, due: "2026-10-30", completed: false, estimatedHours: 2 }],
        },
        outputSchema: groupedSchema,
      },
    },
    {
      id: "no-tasks",
      label: t("execute.examples.empty.label"),
      description: t("execute.examples.empty.description"),
      request: {
        message: t("execute.examples.meeting.message"),
        input: { projectId: "PRJ-1024", members, tasks: tasks.map(task => ({ ...task, completed: true })) },
        outputSchema: exampleSchema,
      },
    },
    {
      id: "missing-input",
      label: t("execute.examples.missing.label"),
      description: t("execute.examples.missing.description"),
      request: {
        message: t("execute.examples.missing.message"),
        input: { projectId: "PRJ-1024", members, tasks: null },
        outputSchema: exampleSchema,
      },
    },
  ];
}
