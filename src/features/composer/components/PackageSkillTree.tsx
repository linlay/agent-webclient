import { SkillIcon } from "@/features/skills/components/SkillIcon";
import { skillDisplayName, skillPackageDisplayName } from "@/shared/utils/skillDisplayName";
import React from "react";
import type { AgentSkill, AgentSkillPackage } from "@/shared/data/api/dto/agents";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import { packageMembers, skillIdentity } from "../lib/skillPackages";
import styles from "./PackageSkillTree.module.css";

interface Props {
  pkg: AgentSkillPackage;
  skills: readonly AgentSkill[];
  selectedKeys: readonly string[];
  selectedPackageId?: string;
  lockedKeys?: readonly string[];
  disabled?: boolean;
  pinned?: boolean;
  pinsDisabled?: boolean;
  search?: string;
  defaultExpanded?: boolean;
  onSelect: (skills: AgentSkill[], selected: boolean, packageId?: string) => void;
  onTogglePin?: (packageId: string) => void;
}

/** Parent and member selection share concrete skill IDs without visible checkboxes. */
export function PackageSkillTree({ pkg, skills, selectedKeys, selectedPackageId, lockedKeys = [], disabled, pinned = false, pinsDisabled, search = "", defaultExpanded = false, onSelect, onTogglePin }: Props) {
  const { t } = useI18n();
  const members = packageMembers(pkg, skills);
  const selected = new Set(selectedKeys.map(skillIdentity));
  const locked = new Set(lockedKeys.map(skillIdentity));
  const manualSelected = new Set([...selected].filter(key => !locked.has(key)));
  const selectedCount = members.filter(member => selected.has(skillIdentity(member.id))).length;
  const unavailable = [...new Set([...(pkg.missingSkillIds || []), ...pkg.skills.filter(member => !members.some(skill => skillIdentity(skill.id) === skillIdentity(member.id))).map(member => member.id)])];
  const complete = pkg.status === "ready" && unavailable.length === 0;
  const allSelected = selectedPackageId === pkg.id && members.length > 0 && selectedCount === members.length;
  const keyword = search.trim().toLowerCase();
  const matchesPackage = [skillPackageDisplayName(pkg), pkg.id].some(value => value.toLowerCase().includes(keyword));
  const visibleMembers = members.filter(skill => !keyword || matchesPackage || [skill.id, skillDisplayName(skill), skill.description || ""].some(value => value.toLowerCase().includes(keyword)));
  return <details className={styles.tree} open={keyword || defaultExpanded ? true : undefined}>
    <summary className={styles.header} data-selection={allSelected && complete ? "all" : selectedCount ? "partial" : "none"}>
      <span className={styles.title}>
        <SkillIcon icon={pkg.icon} fallback="folder" />
        <span className={styles.copy}>
          <span className={styles.name}>{skillPackageDisplayName(pkg)}</span>
          <small className={selectedCount ? styles.hasSelection : styles.meta}>
            {t(selectedCount ? "packageComposer.selectionCount" : "skillConsole.packageContains", { selected: selectedCount, count: members.length + unavailable.length })}
          </small>
        </span>
      </span>
      <button type="button" className={styles.bulk} aria-label={t(allSelected ? "packageComposer.clearAll" : "packageComposer.select", { name: skillPackageDisplayName(pkg) })}
        disabled={disabled || !complete || members.length === 0 || members.every(skill => locked.has(skillIdentity(skill.id)))}
        onClick={event => { event.preventDefault(); event.stopPropagation(); onSelect(members, !allSelected, pkg.id); }}>
        {t(allSelected ? "packageComposer.clear" : "packageComposer.choose")}
      </button>
      {onTogglePin && <button type="button" className={styles.pin}
        aria-label={t(pinned ? "composer.addMenu.skill.unpin" : "composer.addMenu.skill.pin", { name: skillPackageDisplayName(pkg) })}
        aria-pressed={pinned} disabled={pinsDisabled}
        onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }}
        onClick={event => { event.preventDefault(); event.stopPropagation(); onTogglePin(pkg.id); }}>
        <MaterialIcon name="push_pin" className={styles.pinIcon} />
      </button>}
      <span className={styles.folderToggle} aria-hidden="true">
        <MaterialIcon name="folder" className={styles.folderClosed} />
        <MaterialIcon name="folder_open" className={styles.folderOpen} />
      </span>
    </summary>
    {!complete && <div role="status" className={styles.notice}>{t("packageComposer.incomplete")}</div>}
    <div className={styles.members}>
      {visibleMembers.map(skill => <button type="button" className={styles.member} key={skill.id}
        aria-label={skillDisplayName(skill)} aria-pressed={selected.has(skillIdentity(skill.id))}
        disabled={disabled || locked.has(skillIdentity(skill.id))}
        onClick={() => onSelect([skill], !(!selectedPackageId && manualSelected.size === 1 && manualSelected.has(skillIdentity(skill.id))))}>
        <span className={styles.memberCopy} title={skill.description}><span>{skillDisplayName(skill)}</span>{skill.description && <small>{skill.description}</small>}</span>
      </button>)}
      {unavailable.map(id => <button type="button" className={styles.member} key={id} disabled>{id} · {t("packageComposer.unavailable")}</button>)}
    </div>
  </details>;
}
