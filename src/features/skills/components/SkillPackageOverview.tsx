import { SkillIcon } from "./SkillIcon";
import React, { useState } from "react";
import { SkillPackageManifestEditor } from "./SkillPackageManifestEditor";
import { skillDisplayName, skillPackageDisplayName } from "@/shared/utils/skillDisplayName";
import type { AdminSkillPackageSummary, AdminSkillSummary } from "@/shared/data/api/dto/skills";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";

export function SkillPackageOverview({ pack, skills, busy, onSelect, onDelete, onSaved }: {
  pack: AdminSkillPackageSummary;
  skills: AdminSkillSummary[];
  busy: boolean;
  onSelect: (skill: AdminSkillSummary) => void;
  onDelete: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const byKey = new Map(skills.map((skill) => [skill.key, skill]));
  const missing = new Set(pack.missingSkillIds || []);
  return <section className="skill-package-overview">
    <div className="skill-package-overview-heading">
      <SkillIcon icon={pack.icon} fallback="folder" size={24} />
      <h2>{skillPackageDisplayName(pack)}</h2>
      <UiButton variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(true)}>{t("skillPackageEditor.editManifest")}</UiButton>
      <UiButton variant="ghost" size="sm" disabled={busy} onClick={onDelete}>{t("skillPackageEditor.delete")}</UiButton>
    </div>
    <p>{pack.id}{pack.version ? ` · v${pack.version}` : ""} · {t("skillPackageEditor.memberCount", { count: pack.skills.length })}</p>
    {pack.description && <p>{pack.description}</p>}
    <p>{t(pack.status === "incomplete" ? "skillPackageEditor.incomplete" : "skillPackageEditor.editHint")}</p>
    <ul className="skill-package-member-list">{pack.skills.map((member) => {
      const skill = byKey.get(member.id);
      const unavailable = !skill || missing.has(member.id);
      return <li key={member.id}>
        <button type="button" disabled={busy || unavailable} onClick={() => skill && onSelect(skill)}>
          <span>{skill ? skillDisplayName(skill) : member.id}</span>
          {(skill?.version || member.version) && <span>{skill?.version || member.version}</span>}
          <span>{unavailable ? t("skillPackageEditor.missing") : t(`skillConsole.status.${skill.status}`)}</span>
        </button>
      </li>;
    })}</ul>
    {editing && <SkillPackageManifestEditor key={pack.id} packageId={pack.id} onClose={() => setEditing(false)} onSaved={onSaved} />}
  </section>;
}
