import { useCatalogOrder } from "@/features/catalog-order/hooks/useCatalogOrder";

export function usePinnedSkills(enabled: boolean) {
  const { pinnedKeys, togglePin, ...state } = useCatalogOrder("skills", enabled);
  return { ...state, pinnedSkillKeys: pinnedKeys, toggleSkillPin: togglePin };
}
