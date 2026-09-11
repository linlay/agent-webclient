import { useEffect, useState } from "react";
import { getConnectorSkills, getConnectorSkillDetail } from "@/shared/data";
import type { ConnectorSkillListResponse, ConnectorSkillDetail } from "@/shared/data";

export function useConnectorSkills(id: string, catalogKey: string) {
  const [catalog, setCatalog] = useState<ConnectorSkillListResponse | null>(null);
  const [selection, setSelection] = useState({ id: "", name: "" });
  const [detail, setDetail] = useState<ConnectorSkillDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [revision, setRevision] = useState(0);
  const skills = catalog?.connectorId === id ? catalog.skills : [];
  const name = (selection.id === id && skills.some(skill => skill.name === selection.name) ? selection.name : skills[0]?.name) || "";

  useEffect(() => {
    let active = true;
    setCatalog(null);
    setListError("");
    setListLoading(true);
    void getConnectorSkills(id).then(response => {
      if (active) setCatalog(response.data);
    }).catch(cause => {
      if (active) setListError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, [id, catalogKey, revision]);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setDetailError("");
    setDetailLoading(!!name);
    if (name) void getConnectorSkillDetail(id, name).then(response => {
      if (active) setDetail(response.data);
    }).catch(cause => {
      if (active) setDetailError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [id, name, catalogKey, revision]);

  return {
    skills, name, listLoading, detailLoading, listError, detailError,
    detail: detail?.connectorId === id && detail.skill.name === name ? detail : null,
    select: (name: string) => setSelection({ id, name }),
    reload: () => setRevision(value => value + 1),
  };
}
