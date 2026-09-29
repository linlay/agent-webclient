import { skillDisplayName, skillPackageDisplayName } from "@/shared/utils/skillDisplayName";
import React from "react";
import { Popover } from "antd";
import type { AgentSkill, AgentSkillPackage } from "@/shared/data/api/dto/agents";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import { packageMembers, skillIdentity } from "../lib/skillPackages";
import styles from "./PackageSkillTree.module.css";

interface Props {
  pkg: AgentSkillPackage;
  skills: readonly AgentSkill[];
  selectedKeys: readonly string[];
  lockedKeys?: readonly string[];
  disabled?: boolean;
  pinned?: boolean;
  pinsDisabled?: boolean;
  search?: string;
  defaultExpanded?: boolean;
  onSelect: (skills: AgentSkill[], selected: boolean) => void;
  onTogglePin?: (packageId: string) => void;
}

/** Parent and member selection share concrete skill keys without visible checkboxes. */
export function PackageSkillTree({ pkg, skills, selectedKeys, lockedKeys = [], disabled, pinned = false, pinsDisabled, search = "", defaultExpanded = false, onSelect, onTogglePin }: Props) {
  const { t } = useI18n();
  const members = packageMembers(pkg, skills);
  const selected = new Set(selectedKeys.map(skillIdentity));
  const locked = new Set(lockedKeys.map(skillIdentity));
  const selectedCount = members.filter(member => selected.has(skillIdentity(member.key))).length;
  const unavailable = [...new Set([...(pkg.missingSkillIds || []), ...pkg.skills.filter(member => !members.some(skill => skillIdentity(skill.key) === skillIdentity(member.id))).map(member => member.id)])];
  const complete = pkg.status === "ready" && unavailable.length === 0;
  const allSelected = members.length > 0 && selectedCount === members.length;
  const keyword = search.trim().toLowerCase();
  const matchesPackage = [skillPackageDisplayName(pkg), pkg.id].some(value => value.toLowerCase().includes(keyword));
  const visibleMembers = members.filter(skill => !keyword || matchesPackage || [skill.key, skillDisplayName(skill), skill.description || ""].some(value => value.toLowerCase().includes(keyword)));
  const preview = <div className={styles.preview}><strong>{skillPackageDisplayName(pkg)}{pkg.version ? ` · ${pkg.version}` : ""}</strong>{members.map(skill => <div key={skill.key}>{skillDisplayName(skill)}</div>)}{unavailable.map(id => <div key={id}>{id} · {t("packageComposer.unavailable")}</div>)}</div>;
  return <details className={styles.tree} open={keyword || defaultExpanded ? true : undefined}>
    <summary className={styles.header} data-selection={allSelected && complete ? "all" : selectedCount ? "partial" : "none"}>
      <MaterialIcon name="chevron_right" className={styles.chevron} />
      <Popover content={preview} trigger={["hover", "focus"]} placement="right" mouseEnterDelay={0.35}>
        <span tabIndex={0} className={styles.title}>
          <span className={styles.copy}>
            <span className={styles.name}>{skillPackageDisplayName(pkg)}</span>
            <small className={selectedCount ? styles.hasSelection : styles.meta}>
              {t(selectedCount ? "packageComposer.selectionCount" : "packageComposer.memberCount", { selected: selectedCount, count: members.length + unavailable.length })}
            </small>
          </span>
        </span>
      </Popover>
      <button type="button" className={styles.bulk} aria-label={t(allSelected ? "packageComposer.clearAll" : "packageComposer.select", { name: skillPackageDisplayName(pkg) })}
        disabled={disabled || !complete || members.length === 0 || members.every(skill => locked.has(skillIdentity(skill.key)))}
        onClick={event => { event.preventDefault(); event.stopPropagation(); onSelect(members, !allSelected); }}>
        {t(allSelected ? "packageComposer.clear" : "packageComposer.all")}
      </button>
      {onTogglePin && <button type="button" className={styles.pin}
        aria-label={t(pinned ? "composer.addMenu.skill.unpin" : "composer.addMenu.skill.pin", { name: skillPackageDisplayName(pkg) })}
        aria-pressed={pinned} disabled={pinsDisabled}
        onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }}
        onClick={event => { event.preventDefault(); event.stopPropagation(); onTogglePin(pkg.id); }}>
        <MaterialIcon name="push_pin" className={styles.pinIcon} />
      </button>}
    </summary>
    {!complete && <div role="status" className={styles.notice}>{t("packageComposer.incomplete")}</div>}
    <div className={styles.members}>
      {visibleMembers.map(skill => <button type="button" className={styles.member} key={skill.key}
        aria-label={skillDisplayName(skill)} aria-pressed={selected.has(skillIdentity(skill.key))}
        disabled={disabled || locked.has(skillIdentity(skill.key))}
        onClick={() => onSelect([skill], !selected.has(skillIdentity(skill.key)))}>
        <span className={styles.memberCopy} title={skill.description}><span>{skillDisplayName(skill)}</span>{skill.description && <small>{skill.description}</small>}</span>
      </button>)}
      {unavailable.map(id => <button type="button" className={styles.member} key={id} disabled>{id} · {t("packageComposer.unavailable")}</button>)}
    </div>
  </details>;
}
