import { buildExecuteRequest, exampleSchema, ExecuteValidationError } from "./executeForm";

const base = { agentKey: "demo", message: "Extract tasks", input: "{}", schema: JSON.stringify(exampleSchema), accessLevel: "default" as const, files: [] };
function invalid(overrides: Partial<Parameters<typeof buildExecuteRequest>[0]>, field: string) {
  try { buildExecuteRequest({ ...base, ...overrides }); throw new Error("expected validation failure"); }
  catch (e) { expect(e).toBeInstanceOf(ExecuteValidationError); expect((e as ExecuteValidationError).field).toBe(field); }
}

test("accepts optional and arbitrary JSON input without dropping null or false", () => {
  expect(buildExecuteRequest({ ...base, input: "" })).not.toHaveProperty("input");
  for (const input of ["null", "false", "0", "[]", '"text"']) expect(buildExecuteRequest({ ...base, input }).input).toEqual(JSON.parse(input));
});
test("rejects invalid task data and non-object or oversized schemas", () => {
  invalid({ message: " " }, "message");
  invalid({ input: "{" }, "input");
  for (const schema of ["null", "[]", "{}", '{"type":"array"}', '{"type":"object","description":"' + "x".repeat(65536) + '"}']) invalid({ schema }, "schema");
});
test("validates nested file references and allows repeated references", () => {
  const files = [{ field: "file_1", file: { name: "note.txt" } as File }];
  const input = JSON.stringify({ files: [{ $file: "file_1" }, { $file: "file_1" }] });
  expect(buildExecuteRequest({ ...base, files, input }).input).toEqual(JSON.parse(input));
  invalid({ files }, "files");
  invalid({ input }, "files");
  invalid({ files, input: '{"doc":{"$file":"missing"}}' }, "files");
  invalid({ files, input: '{"doc":{"$file":"file_1","extra":true}}' }, "files");
  invalid({ files: [...files, { field: "file_2", file: files[0].file }], input: '[{"$file":"file_1"},{"$file":"file_2"}]' }, "files");
});
