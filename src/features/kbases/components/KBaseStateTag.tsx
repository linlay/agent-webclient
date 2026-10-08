import React from "react";
import { Tag } from "antd";
import { t } from "@/shared/i18n";
import type { KnowledgeBase } from "@/shared/data/api/dto/kbases";

export function KBaseStateTag({ state }: { state: KnowledgeBase["state"] }) {
  const key = { unindexed: "kbases.unindexed", indexing: "kbases.indexing", ready: "kbases.ready", error: "kbases.failed" }[state];
  return <Tag color={state === "ready" ? "success" : state === "error" ? "error" : "default"}>{t(key)}</Tag>;
}
