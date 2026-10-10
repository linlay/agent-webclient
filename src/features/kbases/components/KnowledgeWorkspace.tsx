import React, { useEffect, useRef, useState } from "react";
import { Alert, Button, Drawer, Empty, Input, InputNumber, Popconfirm, Select, Spin, Table, Tabs, Tag, Tooltip, Typography } from "antd";
import { t } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { UiButton } from "@/shared/ui/UiButton";
import { deleteKBase, filesKBase, readKBase, refreshKBase, searchKBase, statusKBase } from "@/shared/data/api/requests/kbases";
import type { KnowledgeBase, KnowledgeBaseStatus, KnowledgeDocument, KnowledgeRead, KnowledgeSearch, RetrievalMethod } from "@/shared/data/api/dto/kbases";
import { documentSource, libraryCollections } from "../lib/documentSource";
import { KBaseStateTag } from "./KBaseStateTag";
import styles from "./KBasesConsole.module.css";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export function KnowledgeWorkspace({ library, onEdit, onChanged, onDeleted }: {
  library: KnowledgeBase;
  onEdit: () => void;
  onChanged: () => Promise<void>;
  onDeleted: () => void;
}) {
  const indexed = Boolean(library.indexedAt);
  const sources = libraryCollections(library);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [files, setFiles] = useState<KnowledgeDocument[]>([]);
  const [fileLoading, setFileLoading] = useState(indexed);
  const [fileError, setFileError] = useState("");
  const [fileIncomplete, setFileIncomplete] = useState(false);
  const [documentFilter, setDocumentFilter] = useState("");
  const [documentCollection, setDocumentCollection] = useState("");
  const [documentPage, setDocumentPage] = useState(1);
  const [status, setStatus] = useState<KnowledgeBaseStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [query, setQuery] = useState("");
  const [limitOverride, setLimit] = useState<number | null>(null);
  const limit = limitOverride ?? library.retrieval?.topK ?? 8;
  const [method, setMethod] = useState<RetrievalMethod>("query");
  const [retrievalCollections, setRetrievalCollections] = useState<string[]>([]);
  const [results, setResults] = useState<KnowledgeSearch | null>(null);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [document, setDocument] = useState<KnowledgeRead | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [open, setOpen] = useState(false);
  const searchAbort = useRef<AbortController>();
  const readAbort = useRef<AbortController>();

  useEffect(() => {
    const controller = new AbortController();
    if (indexed) {
      filesKBase(library.id, controller.signal).then(response => {
        if (!controller.signal.aborted) { setFiles(response.data?.documents || []); setFileIncomplete(Boolean(response.data && !response.data.complete)); }
      }).catch(error => { if (!controller.signal.aborted) setFileError(errorMessage(error)); }).finally(() => { if (!controller.signal.aborted) setFileLoading(false); });
      statusKBase(library.id, controller.signal).then(response => { if (!controller.signal.aborted) setStatus(response.data || null); }).catch(error => { if (!controller.signal.aborted) setStatusError(errorMessage(error)); });
    }
    return () => { controller.abort(); searchAbort.current?.abort(); readAbort.current?.abort(); };
  }, [library.id, indexed]);

  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true); setActionError("");
    try { await action(); await onChanged(); }
    catch (error) { setActionError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  const search = async () => {
    if (!query.trim() || !indexed || searching) return;
    searchAbort.current?.abort();
    const controller = new AbortController(); searchAbort.current = controller;
    setSearching(true); setSearchError(""); setResults(null);
    try {
      const response = await searchKBase(library.id, query.trim(), limit, controller.signal, retrievalCollections.length ? retrievalCollections : undefined, method);
      if (!controller.signal.aborted) setResults(response.data || null);
    } catch (error) { if (!controller.signal.aborted) setSearchError(errorMessage(error)); }
    finally { if (!controller.signal.aborted) setSearching(false); }
  };
  const read = async (ref: string) => {
    readAbort.current?.abort();
    const controller = new AbortController(); readAbort.current = controller;
    setOpen(true); setReading(true); setDocument(null); setReadError("");
    try { const response = await readKBase(library.id, ref, controller.signal); if (!controller.signal.aborted) setDocument(response.data || null); }
    catch (error) { if (!controller.signal.aborted) setReadError(errorMessage(error)); }
    finally { if (!controller.signal.aborted) setReading(false); }
  };
  const selectDocumentCollection = (value?: string) => { setDocumentCollection(value || ""); setDocumentPage(1); };
  const visibleFiles = files.filter(file => {
    const source = documentSource(file);
    return (!documentCollection || source.collection === documentCollection) && `${source.relativePath} ${file.title} ${source.collection}`.toLowerCase().includes(documentFilter.trim().toLowerCase());
  });
  const selectedSource = sources.find(source => source.name === documentCollection);
  const channels: Record<string, string> = { fts: t("kbases.methodSearch"), vector: t("kbases.methodVector"), graph: t("kbases.methodGraph") };
  const intro = <div className={styles.intro}>
    <div className={styles.titleLine}><h2>{library.name}</h2><KBaseStateTag state={library.state} /></div>
    {library.description && <p className={styles.description}>{library.description}</p>}
    <div className={styles.indexMeta}><span>{t("kbases.collectionTotal", { count: sources.length })}</span><span>{t("kbases.indexedAt")}: {library.indexedAt ? new Date(library.indexedAt).toLocaleString() : "—"}</span></div>
    {actionError && <Alert type="error" showIcon message={actionError} />}
    {library.refreshError && <Alert type="warning" showIcon message={library.refreshError} />}
    {library.sourceWarnings?.map(warning => <Alert key={warning} type="warning" showIcon message={warning} />)}
    {library.error && <Alert type="error" showIcon message={library.error} />}
    {library.state === "indexing" && <Alert type="info" showIcon message={t("kbases.indexingHint")} />}
  </div>;
  const actions = <div className={styles.actions}>
    <UiButton size="sm" variant="ghost" iconOnly aria-label={t("kbases.edit")} title={t("kbases.edit")} disabled={library.invalidId || busy || library.state === "indexing"} onClick={onEdit}><MaterialIcon name="edit" /></UiButton>
    <UiButton size="sm" loading={library.state === "indexing" || busy} disabled={library.invalidId || busy} onClick={() => void perform(() => refreshKBase(library.id))}><MaterialIcon name="refresh" />{t("kbases.update")}</UiButton>
    <Popconfirm disabled={library.invalidId || busy || library.state === "indexing"} title={t("kbases.deleteConfirm")} description={t("kbases.deleteHint")} onConfirm={() => perform(async () => { await deleteKBase(library.id); onDeleted(); })}>
      <UiButton size="sm" variant="ghost" iconOnly className={styles.deleteButton} aria-label={t("kbases.delete")} title={t("kbases.delete")} disabled={library.invalidId || busy || library.state === "indexing"}><MaterialIcon name="delete" /></UiButton>
    </Popconfirm>
  </div>;

  return <>
    <Tabs className={styles.workspaceTabs} defaultActiveKey="files" renderTabBar={(props, DefaultTabBar) => <div className={styles.workspaceToolbar}><DefaultTabBar {...props} />{actions}</div>} items={[
      { key: "files", label: <span className={styles.tabLabel}><MaterialIcon name="description" />{t("kbases.files")}{indexed && <span className={styles.tabCount}>{files.length}</span>}</span>, children: <>{intro}
        <div className={styles.documentsToolbar}>
          <SearchFilterBar className={styles.documentSearch} searchText={documentFilter} onSearchChange={value => { setDocumentFilter(value); setDocumentPage(1); }} searchPlaceholder={t("kbases.filterDocuments")} searchAriaLabel={t("kbases.filterDocuments")} filters={[]} />
          <Select className={styles.documentCollection} aria-label={t("kbases.collection")} placeholder={t("kbases.allCollections")} value={documentCollection || undefined} allowClear onChange={selectDocumentCollection} options={sources.map(source => ({ value: source.name, label: `${source.name}${indexed && !fileLoading ? ` (${files.filter(file => documentSource(file).collection === source.name).length})` : ""}` }))} />
        </div>
        {selectedSource && <div className={styles.sourcePath}><MaterialIcon name="folder" /><span title={selectedSource.sourcePath}>{selectedSource.sourcePath}</span></div>}
        <div className={styles.documentsBody}>
          {fileError && <Alert type="error" showIcon message={fileError} />}
          {fileIncomplete && <Alert type="warning" showIcon message={t("kbases.incomplete")} />}
          {indexed ? <Table<KnowledgeDocument> loading={fileLoading} rowKey="file" dataSource={visibleFiles} size="small" pagination={{ current: documentPage, onChange: setDocumentPage, pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }} locale={{ emptyText: t(fileError ? "kbases.documentsUnavailable" : "kbases.noDocuments") }} columns={[
            { title: t("kbases.file"), dataIndex: "file", render: (ref: string, file) => <Button className={styles.documentLink} type="link" icon={<MaterialIcon name="description" />} onClick={() => void read(ref)}>{documentSource(file).relativePath}</Button> },
            { title: t("kbases.collection"), key: "collection", width: 140, render: (_, file) => <button type="button" className={styles.collectionLink} title={t("kbases.showCollection")} onClick={() => selectDocumentCollection(documentSource(file).collection)}>{documentSource(file).collection}</button> },
            { title: t("kbases.bytes"), dataIndex: "bytes", width: 90, align: "right", responsive: ["sm"] },
          ]} /> : <Empty description={t("kbases.buildHint")} />}
        </div>
      </> },
      { key: "search", label: <span className={styles.tabLabel}><MaterialIcon name="search" />{t("kbases.recall")}</span>, children: <>{intro}<div className={styles.retrievalBody}>
        <Typography.Paragraph type="secondary">{t("kbases.recallHint")}</Typography.Paragraph>
        {!indexed ? <Empty description={t("kbases.buildHint")} /> : <>
          <div className={styles.search}>
            <Input variant="filled" prefix={<MaterialIcon name="search" />} aria-label={t("kbases.query")} placeholder={t("kbases.query")} value={query} maxLength={2000} disabled={searching} onChange={event => { setQuery(event.target.value); setResults(null); }} onPressEnter={() => void search()} />
            <UiButton size="sm" variant="primary" loading={searching} disabled={!query.trim()} onClick={() => void search()}>{t("kbases.search")}</UiButton>
          </div>
          <div className={styles.retrievalOptions}>
            <label><span>{t("kbases.method")}</span><Select aria-label={t("kbases.method")} value={method} disabled={searching} onChange={value => { setMethod(value); setResults(null); }} options={[
              { value: "query", label: t("kbases.methodQuery") }, { value: "search", label: t("kbases.methodSearch") },
              { value: "vsearch", label: t("kbases.methodVector"), disabled: !status?.capabilities.vector?.complete || !status.capabilities.vector.queryModelConfigured },
              { value: "gsearch", label: t("kbases.methodGraph"), disabled: !status?.capabilities.graph?.complete },
            ]} /></label>
            <label className={styles.collectionFilter}><span>{t("kbases.collections")}</span><Select mode="multiple" maxTagCount="responsive" allowClear aria-label={t("kbases.collections")} placeholder={t("kbases.defaultCollections")} value={retrievalCollections} disabled={searching} onChange={value => { setRetrievalCollections(value); setResults(null); }} options={sources.map(source => ({ value: source.name, label: source.name }))} /></label>
            <label className={styles.limit}><span>{t("kbases.limit")}</span><InputNumber aria-label={t("kbases.limit")} min={1} max={50} value={limit} disabled={searching} onChange={value => { setLimit(value); setResults(null); }} /></label>
          </div>
          {statusError && <Alert type="warning" showIcon message={statusError} />}
          {status && <div className={styles.capabilityHints}>{(!status.capabilities.vector?.complete || !status.capabilities.vector.queryModelConfigured) && <p>{t("kbases.vectorUnavailable")}</p>}{!status.capabilities.graph?.complete && <p>{t("kbases.graphUnavailable")}</p>}</div>}
          {searchError && <Alert type="error" showIcon message={searchError} />}
          {results && <div className={styles.results}>
            <Typography.Paragraph>{t("kbases.hitCount", { count: results.results.length })}{results.trace?.coverage?.retrievalUsed?.length ? ` · ${t("kbases.channels")}: ${results.trace.coverage.retrievalUsed.map(channel => channels[channel] || channel).join(", ")}` : ""}</Typography.Paragraph>
            {((Array.isArray(results.trace?.degraded) ? results.trace.degraded.length > 0 : results.trace?.degraded) || results.trace?.candidateBudgetExhausted) && <Alert type="warning" showIcon message={t("kbases.incomplete")} />}
            {results.results.length === 0 && <Empty description={t("kbases.noHits")} />}
            {results.results.map(hit => { const source = documentSource(hit); return <article key={hit.resultId} className={styles.hit}>
              <div className={styles.hitHeading}><Button className={styles.documentLink} type="link" onClick={() => void read(hit.file)}>{hit.title || source.relativePath}</Button><Tag>{source.collection}</Tag><Tooltip title={t("kbases.similarityHint")}><Tag>{t("kbases.similarity")}: {hit.scoreType === "vector_similarity" && typeof hit.score === "number" && Number.isFinite(hit.score) ? hit.score.toFixed(4) : "—"}</Tag></Tooltip></div>
              <div className={styles.hitPath} title={hit.file}>{source.relativePath}</div>
              <div className={styles.hitRange} title={hit.chunk?.id}>{hit.chunk ? `${t("kbases.chunk")} ${hit.chunk.seq + 1} · ` : ""}{t("kbases.lines", { start: hit.evidence.range.lineStart, end: hit.evidence.range.lineEnd })}</div>
              <pre>{hit.evidence.text}</pre>
            </article>; })}
          </div>}
        </>}
      </div></> },
    ]} />
    <Drawer title={document?.file || t("kbases.preview")} open={open} width="min(720px, 100vw)" onClose={() => { readAbort.current?.abort(); setOpen(false); }}>
      <Spin spinning={reading}>{readError ? <Alert type="error" showIcon message={readError} /> : <pre className={styles.content}>{document?.evidence?.text || document?.body}</pre>}{document?.readRange?.hasMore && <Alert type="info" showIcon message={t("kbases.previewLimit")} />}</Spin>
    </Drawer>
  </>;
}
