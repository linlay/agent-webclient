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

export interface SkillPackageManifest { content: string; sha256: string }

export function getAdminSkillPackageManifest(key: string): Promise<ApiResponse<SkillPackageManifest>> {
  return requestJson(`${dataEndpoints.adminSkillPackageManifest.path}?${new URLSearchParams({ key })}`);
}

export function saveAdminSkillPackageManifest(key: string, content: string, baseSha256: string): Promise<ApiResponse<SkillPackageManifest>> {
  return requestJson(dataEndpoints.adminSkillPackageManifestSave.path, {
    method: "PUT", body: JSON.stringify({ key, content, baseSha256 }),
  });
}
