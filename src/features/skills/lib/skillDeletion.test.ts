import { ApiError } from "@/shared/data";
import {
  requestSkillDeletion,
  skillDeleteBlockedAgents,
} from "@/features/skills/lib/skillDeletion";

describe("skill deletion", () => {
  it("returns the confirmed deleted key", async () => {
    const request = jest.fn().mockResolvedValue({
      status: 200,
      code: 0,
      msg: "success",
      data: { key: "demo-skill", deleted: true },
    });

    await expect(requestSkillDeletion(" demo-skill ", request)).resolves.toEqual({
      kind: "deleted",
      key: "demo-skill",
    });
    expect(request).toHaveBeenCalledWith("demo-skill");
  });

  it("returns a normalized Agent list for an in-use conflict", async () => {
    const conflict = new ApiError("skill is used by agents", {
      status: 409,
      data: {
        error: {
          usedByAgents: ["agent-b", " agent-a ", "agent-b", "", null],
        },
      },
    });
    const request = jest.fn().mockRejectedValue(conflict);

    await expect(requestSkillDeletion("demo-skill", request)).resolves.toEqual({
      kind: "blocked",
      usedByAgents: ["agent-b", "agent-a"],
    });
    expect(skillDeleteBlockedAgents(conflict)).toEqual(["agent-b", "agent-a"]);
  });

  it("rethrows conflicts without a usable Agent list", async () => {
    const conflict = new ApiError("conflict", {
      status: 409,
      data: { error: { usedByAgents: [] } },
    });
    const request = jest.fn().mockRejectedValue(conflict);

    await expect(requestSkillDeletion("demo-skill", request)).rejects.toBe(conflict);
  });

  it("rethrows non-conflict errors", async () => {
    const failure = new ApiError("server unavailable", { status: 503 });
    const request = jest.fn().mockRejectedValue(failure);

    await expect(requestSkillDeletion("demo-skill", request)).rejects.toBe(failure);
  });

  it("rejects an unconfirmed success response", async () => {
    const request = jest.fn().mockResolvedValue({
      status: 200,
      code: 0,
      msg: "success",
      data: { key: "demo-skill", deleted: false },
    });

    await expect(requestSkillDeletion("demo-skill", request)).rejects.toThrow(
      "skill deletion was not confirmed by the server",
    );
  });
});
