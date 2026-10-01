import type { AdminSourceResponse } from "@/shared/data/api/dto/admin";
import { getAdminSource, updateAdminSource } from "./admin";
import type { ApiResponse } from "@/shared/data/api/dto/common";
import { postJson } from "@/shared/data/api/http";
import { dataEndpoints } from "@/shared/data/api/endpoints";

export function deleteAdminSkillPackage(id: string): Promise<ApiResponse<{ id: string; deleted: boolean }>> {
  return postJson(dataEndpoints.adminSkillPackageDelete.path, { id });
}

export function deleteAdminSkillPackageMember(packageId: string, skillId: string): Promise<ApiResponse<{ packageId: string; skillId: string; deleted: boolean }>> {
  return postJson(dataEndpoints.adminSkillPackageMemberDelete.path, { packageId, skillId });
}

/** Package metadata and ordered members use the shared source editing contract. */
export function getAdminSkillPackageManifest(id: string): Promise<ApiResponse<AdminSourceResponse>> {
  return getAdminSource({ type: "skill-package", id });
}

export function saveAdminSkillPackageManifest(id: string, content: string, baseSha256: string): Promise<ApiResponse<AdminSourceResponse>> {
  return updateAdminSource({
    target: { type: "skill-package", id }, content, baseSha256,
  });
}
