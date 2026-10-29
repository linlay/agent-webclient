import { getExecuteExamples } from "./executeExamples";
import { buildExecuteRequest } from "./executeForm";

const examples = getExecuteExamples(key => key);
type Task = { id: number; ownerId: number; completed: boolean; estimatedHours: number; due: string | null };
function input(id: string) {
  return examples.find(example => example.id === id)!.request.input as {
    projectId: string; members: { id: number; name: string }[]; tasks: Task[] | null;
  };
}

test("bundled samples contain structured records and valid complete requests", () => {
  for (const example of examples) {
    const request = example.request;
    expect(request.input).not.toHaveProperty("text");
    expect(buildExecuteRequest({
      agentKey: "taskExtractor.demo", message: request.message,
      input: JSON.stringify(request.input), schema: JSON.stringify(request.outputSchema),
      accessLevel: "ask_for_approval", files: [],
    })).toMatchObject(request);
  }
  const records = input("meeting");
  expect(records.tasks).toHaveLength(3);
  expect(records.tasks!.filter(task => !task.completed)).toHaveLength(2);
  for (const task of records.tasks!) {
    expect(typeof task.id).toBe("number");
    expect(typeof task.completed).toBe("boolean");
    expect(typeof task.estimatedHours).toBe("number");
    expect(records.members.some(member => member.id === task.ownerId)).toBe(true);
  }
});

test("aggregation sample supplies numeric work hours and a numeric output contract", () => {
  const records = input("owners");
  const pending = records.tasks!.filter(task => !task.completed);
  expect(pending).toHaveLength(3);
  expect(pending.filter(task => task.ownerId === 1).reduce((sum, task) => sum + task.estimatedHours, 0)).toBe(6);
  expect(pending.filter(task => task.ownerId === 2).reduce((sum, task) => sum + task.estimatedHours, 0)).toBe(3);
  const schema = examples.find(example => example.id === "owners")!.request.outputSchema as any;
  expect(schema.properties.totalTasks.type).toBe("integer");
  expect(schema.properties.owners.items.properties.totalHours.type).toBe("number");
});

test("no pending work and missing task data are distinct scenarios", () => {
  expect(input("no-tasks").tasks!.every(task => task.completed)).toBe(true);
  expect(input("missing-input").tasks).toBeNull();
});
