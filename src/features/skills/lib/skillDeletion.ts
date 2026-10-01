import {
  ApiError,
  deleteAdminSkill,
  type AdminSkillDeleteResponse,
  type ApiResponse,
} from "@/shared/data";

export type SkillDeleteOutcome =
  | { kind: "deleted"; id: string }
  | { kind: "blocked"; usedByAgents: string[] };

type DeleteSkillRequest = (
  id: string,
) => Promise<ApiResponse<AdminSkillDeleteResponse>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object";
}

export function skillDeleteBlockedAgents(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.status !== 409) return [];
  const data = isRecord(error.data) ? error.data : null;
  const errorData = isRecord(data?.error) ? data.error : null;
  const values = errorData?.usedByAgents;
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );
}

export async function requestSkillDeletion(
  rawId: string,
  request: DeleteSkillRequest = deleteAdminSkill,
): Promise<SkillDeleteOutcome> {
  const id = rawId.trim();
  try {
    const response = await request(id);
    if (!response.data.deleted) {
      throw new Error("skill deletion was not confirmed by the server");
    }
    return {
      kind: "deleted",
      id: response.data.id.trim() || id,
    };
  } catch (error) {
    const usedByAgents = skillDeleteBlockedAgents(error);
    if (usedByAgents.length > 0) {
      return { kind: "blocked", usedByAgents };
    }
    throw error;
  }
}
