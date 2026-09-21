import { useEffect, useRef, useState } from "react";
import { Popover } from "antd";
import { MaterialIcon } from "@/shared/icons/material";
import { useI18n } from "@/shared/i18n";
import { getProjectGitBranches, changeProjectGitBranch } from "@/shared/data/api/routedClient";
import type { ProjectGitBranchesResponse } from "@/shared/data/api/dto/resources";
import { useProjectGit } from "@/features/composer/hooks/useProjectGit";
import { projectGitCache, projectGitCacheKey, isProjectGitSnapshot } from "@/features/composer/lib/projectGitCache";
import styles from "./ComposerContextBar.module.css";

export function ComposerGitBranch({ agentKey, workspaceDir, disabled = false }: {
  agentKey: string; workspaceDir?: string; disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ProjectGitBranchesResponse | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const alive = useRef(true);
  const mutating = useRef(false);
  const cacheKey = projectGitCacheKey(agentKey, workspaceDir);
  const git = useProjectGit(agentKey, workspaceDir, 0, pending || open);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!open || !cacheKey) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    void getProjectGitBranches(agentKey, { signal: controller.signal }).then(response => {
      const result = response.data;
      if (response.code !== 0 || !result || !isProjectGitSnapshot(result.git, agentKey) || !result.git.revision ||
        !Array.isArray(result.branches) || !result.branches.every(branch => typeof branch === "string") || typeof result.canChange !== "boolean") {
        throw new Error(t("composer.git.failed"));
      }
      if (active) { setData(result); projectGitCache.put(cacheKey, result.git); }
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : t("composer.git.failed"));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [open, agentKey, cacheKey, refreshKey, t]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !mutating.current) setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
  const change = async (operation: "switch" | "create", branch: string) => {
    if (mutating.current || disabled || loading || !data?.canChange || !data.git.revision || !branch) return;
    projectGitCache.invalidate(cacheKey);
    mutating.current = true;
    setPending(true);
    setError("");
    try {
      const response = await changeProjectGitBranch({ agentKey, operation, branch, expectedRevision: data.git.revision });
      if (response.code !== 0 || response.data?.agentKey !== agentKey || response.data?.status !== "branch" || response.data.branch !== branch) {
        throw new Error(t("composer.git.failed"));
      }
      projectGitCache.put(cacheKey, response.data);
      if (alive.current) { setOpen(false); setName(""); }
    } catch (cause) {
      if (alive.current) { setError(cause instanceof Error ? cause.message : t("composer.git.failed")); setRefreshKey(value => value + 1); }
    } finally {
      mutating.current = false;
      if (alive.current) setPending(false);
    }
  };
  const label = git?.status === "branch" ? git.branch
    : git?.status === "detached" ? `${t("composer.context.detachedHead")} · ${git.commit?.slice(0, 8)}` : null;
  if (!cacheKey || !label) return null;
  const blocked = pending || loading || disabled || !data?.canChange;
  const filtered = data?.branches.filter(branch => branch.toLocaleLowerCase().includes(name.toLocaleLowerCase())) || [];
  const blockedMessage = data?.blockedReason === "workspace_not_repo_root" ? t("composer.git.subdirectory")
    : data?.blockedReason === "workspace_contains_chats" ? t("composer.git.containsChats") : t("composer.git.readOnly");
  return (
    <Popover open={open && !disabled} onOpenChange={next => {
      if (!disabled && !mutating.current) { setOpen(next); if (next) { setError(""); setName(""); } }
    }} trigger={["click"]} placement="topLeft" arrow={false}
      align={{ overflow: { adjustX: true, adjustY: true, shiftX: 8, shiftY: 8 } }} content={
      <div className={styles.branchMenu} role="dialog" aria-label={t("composer.git.select")}>
        <form onSubmit={event => { event.preventDefault(); void change("create", name.trim()); }}>
          <input className={styles.branchInput} aria-label={t("composer.git.name")} placeholder={t("composer.git.name")}
            value={name} onChange={event => setName(event.target.value)} disabled={pending} maxLength={255} />
          {loading && <div role="status">{t("composer.git.loading")}</div>}
          {error && <div role="alert" className={styles.branchError}>{error}</div>}
          {data && !data.canChange && <p>{blockedMessage}</p>}
          {data?.expectedBranch && <p>{t("composer.git.expected", { branch: data.expectedBranch })}</p>}
          <div className={styles.branchList}>
            {filtered.map(branch => <button type="button" key={branch} className={styles.branchOption}
              disabled={blocked || branch === data?.git.branch} onClick={() => { void change("switch", branch); }}>
              <span>{branch}</span>{branch === data?.git.branch && <MaterialIcon name="check" />}
            </button>)}
            {data && filtered.length === 0 && <p>{t("composer.git.empty")}</p>}
          </div>
          <button type="submit" className={styles.branchCreate} disabled={blocked || !name.trim() || data?.branches.includes(name.trim())}>
            {pending ? t("composer.git.changing") : t("composer.git.create")}
          </button>
          {error && !pending && <button type="button" className={styles.branchOption} onClick={() => { setError(""); setRefreshKey(value => value + 1); }}>{t("composer.git.retry")}</button>}
        </form>
      </div>
    }>
      <button type="button" className={`${styles.branch} ${styles.branchTrigger}`} disabled={disabled || pending}
        title={git?.commit ? `${label} · ${git.commit}` : label} aria-label={t("composer.git.select")} aria-haspopup="dialog" aria-expanded={open} aria-live="polite">
        <MaterialIcon name="branches" /><span className={styles.branchLabel}>{label}</span><MaterialIcon name="expand_more" />
      </button>
    </Popover>
  );
}
