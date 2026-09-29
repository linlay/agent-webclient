import type { AdminSourceResponse } from "@/shared/data/api/dto/admin";
import { getAdminSource, updateAdminSource } from "./admin";
import type { ApiResponse } from "@/shared/data/api/dto/common";
import type { AdminSkillPackageSummary } from "@/shared/data/api/dto/skills";
import { requestJson, postJson } from "@/shared/data/api/http";
import { dataEndpoints } from "@/shared/data/api/endpoints";

export function getAdminSkillPackages(): Promise<ApiResponse<AdminSkillPackageSummary[]>> {
  return requestJson<AdminSkillPackageSummary[]>(dataEndpoints.adminSkillPackages.path);
}

export function deleteAdminSkillPackage(key: string): Promise<ApiResponse<{ key: string; deleted: boolean }>> {
  return postJson(dataEndpoints.adminSkillPackageDelete.path, { key });
}

export function deleteAdminSkillPackageMember(packageId: string, skillId: string): Promise<ApiResponse<{ packageId: string; skillId: string; deleted: boolean }>> {
  return postJson(dataEndpoints.adminSkillPackageMemberDelete.path, { packageId, skillId });
}

/** Package metadata and ordered members use the shared source editing contract. */
export function getAdminSkillPackageManifest(key: string): Promise<ApiResponse<AdminSourceResponse>> {
  return getAdminSource({ type: "skill-package", key });
}

export function saveAdminSkillPackageManifest(key: string, content: string, baseSha256: string): Promise<ApiResponse<AdminSourceResponse>> {
  return updateAdminSource({
    target: { type: "skill-package", key }, content, baseSha256,
  });
}
