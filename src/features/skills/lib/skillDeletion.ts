import {
  ApiError,
  deleteAdminSkill,
  type AdminSkillDeleteResponse,
  type ApiResponse,
} from "@/shared/data";

export type SkillDeleteOutcome =
  | { kind: "deleted"; key: string }
  | { kind: "blocked"; usedByAgents: string[] };

type DeleteSkillRequest = (
  key: string,
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
  rawKey: string,
  request: DeleteSkillRequest = deleteAdminSkill,
): Promise<SkillDeleteOutcome> {
  const key = rawKey.trim();
  try {
    const response = await request(key);
    if (!response.data.deleted) {
      throw new Error("skill deletion was not confirmed by the server");
    }
    return {
      kind: "deleted",
      key: response.data.key.trim() || key,
    };
  } catch (error) {
    const usedByAgents = skillDeleteBlockedAgents(error);
    if (usedByAgents.length > 0) {
      return { kind: "blocked", usedByAgents };
    }
    throw error;
  }
}
