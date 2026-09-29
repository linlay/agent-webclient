import React, { useEffect, useState } from "react";
import { Alert, Modal, Spin } from "antd";
import { CodeEditor } from "@/shared/ui/CodeEditor";
import { useI18n } from "@/shared/i18n";
import { getAdminSkillPackageManifest, saveAdminSkillPackageManifest } from "@/shared/data/api/requests/skillPackages";

/** Edits package metadata and declared members; Platform validates membership and references. */
export function SkillPackageManifestEditor({ packageId, onClose, onSaved }: {
  packageId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [original, setOriginal] = useState("");
  const [content, setContent] = useState("");
  const [sha256, setSha256] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let canceled = false;
    setLoading(true); setError("");
    void getAdminSkillPackageManifest(packageId).then(({ data }) => {
      if (!canceled) { setOriginal(data.content); setContent(data.content); setSha256(data.sha256); }
    }).catch(reason => { if (!canceled) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (!canceled) setLoading(false); });
    return () => { canceled = true; };
  }, [packageId, attempt]);
  const close = () => { if (saving) return; if (content !== original) setDiscard(true); else onClose(); };
  const save = async () => {
    setError("");
    try {
      const manifest = JSON.parse(content);
      if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
        || manifest.name !== packageId || !Array.isArray(manifest.skills)
        || manifest.skills.some((member: unknown) => !member || typeof member !== "object"
          || Array.isArray(member) || !("key" in member) || typeof member.key !== "string")) {
        throw new Error(t("skillPackageEditor.manifestInvalid"));
      }
      setSaving(true);
      const { data } = await saveAdminSkillPackageManifest(packageId, content, sha256);
      setOriginal(data.content); setContent(data.content); setSha256(data.sha256);
      await onSaved();
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  return <>
    <Modal open title={`${packageId}/package.json`} width={800} onCancel={close} onOk={() => void save()}
      okText={t("skillConsole.action.save")} cancelText={t("skillConsole.action.cancel")} confirmLoading={saving}
      okButtonProps={{ disabled: loading || !sha256 || content === original }} cancelButtonProps={{ disabled: saving }} maskClosable={false}>
      <p>{t("skillPackageEditor.manifestHint")}</p>
      {error && <Alert type="error" role="alert" message={error} action={!sha256 ? <button type="button" onClick={() => setAttempt(value => value + 1)}>{t("skillPackageEditor.retry")}</button> : undefined} />}
      <Spin spinning={loading}><div style={{ height: 420 }}><CodeEditor language="json" path={`${packageId}/package.json`} value={content} onChange={setContent} disabled={loading || saving} /></div></Spin>
    </Modal>
    <Modal open={discard} title={t("skillConsole.message.unsaved")} onOk={onClose} onCancel={() => setDiscard(false)} okText={t("skillPackageEditor.discard")} cancelText={t("skillConsole.action.cancel")}>
      {t("skillPackageEditor.discardHint")}
    </Modal>
  </>;
}
