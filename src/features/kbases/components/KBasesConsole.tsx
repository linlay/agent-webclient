import React, { useEffect, useRef, useState } from "react";
import { Alert, Button, ConfigProvider, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Spin, Table, Tabs, Tag, Tooltip, Typography } from "antd";
import { t } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useKBases } from "../hooks/useKBases";
import { deleteKBase, filesKBase, readKBase, refreshKBase, saveKBase, searchKBase, statusKBase } from "@/shared/data/api/requests/kbases";
import type { KnowledgeBase, KnowledgeBaseInput, KnowledgeBaseStatus, KnowledgeDocument, KnowledgeRead, KnowledgeSearch, RetrievalMethod } from "@/shared/data/api/dto/kbases";
import { documentSource, libraryCollections } from "../lib/documentSource";
import styles from "./KBasesConsole.module.css";
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
const stateLabel = (state: KnowledgeBase["state"]) => ({ unindexed: t("kbases.unindexed"), indexing: t("kbases.indexing"), ready: t("kbases.ready"), error: t("kbases.failed") })[state];

export function KBasesConsole() {
 const { items, loading, error, reload } = useKBases();
 const [selected, select] = useState("");
 const [filter, setFilter] = useState("");
 const [editor, setEditor] = useState<KnowledgeBase | "new" | null>(null);
 const [busy, setBusy] = useState(false);
 const [actionError, setActionError] = useState("");
 const [form] = Form.useForm<KnowledgeBaseInput>();
 const active = items.find(x => x.id === selected) || items[0];
 const perform = async (fn: () => Promise<unknown>) => { setBusy(true); setActionError(""); try { await fn(); await reload(); } catch(e) { setActionError(message(e)); } finally { setBusy(false); } };
 const edit = (item: KnowledgeBase | "new") => { setActionError(""); setEditor(item); form.resetFields(); form.setFieldsValue(item === "new" ? { name: "", description: "", collections: [{ name: "workspace", sourcePath: "" }] } : { name: item.name, description: item.description, collections: libraryCollections(item).map(c => ({ ...c })) }); };
 return <ConfigProvider componentSize="small"><div className={styles.root}>
  {(error || actionError) && <Alert type="error" showIcon message={error || actionError} />}
  <div className={styles.layout}><aside className={styles.sidebar}>
   <header className={styles.listHeader}>
    <h2>{t("settingsMenu.knowledgeBase")}</h2>
    <Space size={2}>
     <Button className={`ui-icon-hover-24 ${styles.iconButton}`} type="text" title={t("kbases.reload")} aria-label={t("kbases.reload")} icon={<MaterialIcon name="refresh" />} onClick={() => void reload()} />
     <Button className={`ui-icon-hover-24 ${styles.iconButton}`} type="text" title={t("kbases.create")} aria-label={t("kbases.create")} icon={<MaterialIcon name="add" />} onClick={() => edit("new")} />
    </Space>
   </header>
   <div className={styles.filter}>
   <Input prefix={<MaterialIcon name="search" />} allowClear aria-label={t("kbases.filter")} placeholder={t("kbases.filter")} value={filter} onChange={e => setFilter(e.target.value)} />
   </div>
   <div className={styles.listScroll}>
   {loading ? <Spin /> : items.length === 0 ? <p className={styles.empty}>{t("kbases.empty")}</p> : items.filter(x => `${x.name} ${x.description}`.toLowerCase().includes(filter.toLowerCase())).map(item => { const summary = item.description || libraryCollections(item).map(c => c.name).join(", "); return <button className={`${styles.library} ${active?.id === item.id ? styles.selected : ""}`} key={item.id} aria-pressed={active?.id === item.id} onClick={() => select(item.id)}><div className={styles.itemHeading}><MaterialIcon name="database" /><strong>{item.name}</strong><Tag color={item.state === "ready" ? "green" : item.state === "error" ? "red" : "default"}>{stateLabel(item.state)}</Tag></div><span className={styles.itemDescription} title={summary}>{summary}</span></button>; })}
   </div>
  </aside><section className={styles.detail}>{active ? <>
   <div className={styles.header}><div className={styles.detailHeading}><h3>{active.name}</h3><Tag color={active.state === "ready" ? "green" : active.state === "error" ? "red" : "default"}>{stateLabel(active.state)}</Tag></div><Space size={4} wrap><Tooltip title={t("kbases.edit")}><Button className={`ui-icon-hover-24 ${styles.iconButton}`} type="text" aria-label={t("kbases.edit")} icon={<MaterialIcon name="edit" />} disabled={busy || active.state === "indexing"} onClick={() => edit(active)} /></Tooltip><Button className={styles.updateButton} icon={<MaterialIcon name="refresh" />} loading={active.state === "indexing"} disabled={busy} onClick={() => void perform(() => refreshKBase(active.id))}>{t("kbases.update")}</Button><Popconfirm title={t("kbases.deleteConfirm")} description={t("kbases.deleteHint")} onConfirm={() => perform(async () => { await deleteKBase(active.id); select(""); })}><Tooltip title={t("kbases.delete")}><Button className={`ui-icon-hover-24 ${styles.iconButton}`} type="text" danger aria-label={t("kbases.delete")} icon={<MaterialIcon name="delete" />} disabled={busy || active.state === "indexing"} /></Tooltip></Popconfirm></Space></div>
   <div className={styles.detailBody}>
   {active.description && <p className={styles.description}>{active.description}</p>}
   <dl className={styles.metadata}><div><dt><MaterialIcon name="folder" />{t("kbases.collections")}</dt><dd className={styles.collectionSources}>{libraryCollections(active).map(c => <div key={c.name}><Tag>{c.name}</Tag><span title={c.sourcePath}>{c.sourcePath}</span></div>)}</dd></div><div><dt><MaterialIcon name="schedule" />{t("kbases.indexedAt")}</dt><dd>{active.indexedAt ? new Date(active.indexedAt).toLocaleString() : "—"}</dd></div></dl>
   {active.error && <Alert type="error" showIcon message={active.error} />}
   {active.state === "indexing" && <Alert type="info" showIcon message={t("kbases.indexingHint")} />}
   {active.indexedAt ? <KnowledgeData key={`${active.id}:${active.indexedAt}`} library={active} /> : <p className={styles.empty}>{t("kbases.buildHint")}</p>}
   </div>
  </> : <div className={styles.empty}><p>{t("kbases.empty")}</p><Button onClick={() => edit("new")}>{t("kbases.create")}</Button></div>}</section></div>
  <Modal width={720} title={editor === "new" ? t("kbases.create") : t("kbases.edit")} open={editor !== null} confirmLoading={busy} onCancel={() => setEditor(null)} onOk={() => { void form.validateFields().then(values => perform(async () => { const r = await saveKBase(values, editor && editor !== "new" ? editor.id : undefined); if (r.data) select(r.data.id); setEditor(null); })).catch(() => {}); }}>
   <Form form={form} layout="vertical"><Form.Item name="name" label={t("kbases.name")} rules={[{ required: true, whitespace: true }]}><Input maxLength={100} /></Form.Item><Form.Item name="description" label={t("kbases.description")}><Input.TextArea rows={3} maxLength={1000} /></Form.Item>
    <Typography.Text strong>{t("kbases.collections")}</Typography.Text><Typography.Paragraph type="secondary">{t("kbases.sourceHint")}</Typography.Paragraph>
    <Form.List name="collections" rules={[{ validator: async (_, values) => { if (!values?.length || values.length > 32) throw new Error(t("kbases.collectionCount")); const names = values.map((c: { name?: string }) => c?.name); if (new Set(names).size !== names.length) throw new Error(t("kbases.duplicateCollection")); } }]}>{(fields, { add, remove }, { errors }) => <>
     {fields.map(field => <div key={field.key} className={styles.collectionRow}><Form.Item name={[field.name, "name"]} label={t("kbases.collectionName")} rules={[{ required: true }, { pattern: /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,63}$/u, message: t("kbases.collectionNameHint") }]}><Input disabled={editor !== "new"} maxLength={64} placeholder={t("kbases.collectionNamePlaceholder")} /></Form.Item><Form.Item name={[field.name, "sourcePath"]} label={t("kbases.source")} rules={[{ required: true, whitespace: true }]}><Input disabled={editor !== "new"} placeholder="/path/to/documents" /></Form.Item>{editor === "new" && <Button type="text" danger aria-label={t("kbases.removeCollection")} disabled={fields.length <= 1} icon={<MaterialIcon name="close" />} onClick={() => remove(field.name)} />}</div>)}
     {editor === "new" && <Button type="dashed" block disabled={fields.length >= 32} icon={<MaterialIcon name="add" />} onClick={() => add({ name: "", sourcePath: "" })}>{t("kbases.addCollection")}</Button>}<Form.ErrorList errors={errors} />
    </>}</Form.List>
   </Form>
   {actionError && <Alert type="error" message={actionError} />}
  </Modal>
 </div></ConfigProvider>;
}
function KnowledgeData({ library }: { library: KnowledgeBase }) {
 const [files, setFiles] = useState<KnowledgeDocument[]>([]);
 const [query, setQuery] = useState(""); const [limit, setLimit] = useState(10);
 const [results, setResults] = useState<KnowledgeSearch | null>(null);
 const [method, setMethod] = useState<RetrievalMethod>("query");
 const [collections, setCollections] = useState<string[]>([]);
 const [status, setStatus] = useState<KnowledgeBaseStatus | null>(null);
 const [statusError, setStatusError] = useState("");
 const [error, setError] = useState(""); const [searching, setSearching] = useState(false);
 const [fileLoading, setFileLoading] = useState(true);
 const [document, setDocument] = useState<KnowledgeRead | null>(null);
 const [reading, setReading] = useState(false);
 const [open, setOpen] = useState(false);
 const channelLabels: Record<string, string> = { fts: t("kbases.methodSearch"), vector: t("kbases.methodVector"), graph: t("kbases.methodGraph") };
 const searchAbort = useRef<AbortController>(); const readAbort = useRef<AbortController>();
 useEffect(() => { const controller = new AbortController(); filesKBase(library.id, controller.signal).then(r => { if (!controller.signal.aborted) { setFiles(r.data?.documents || []); if (r.data && !r.data.complete) setError(t("kbases.incomplete")); } }).catch(e => { if (!controller.signal.aborted) setError(message(e)); }).finally(() => { if (!controller.signal.aborted) setFileLoading(false); }); return () => { controller.abort(); searchAbort.current?.abort(); readAbort.current?.abort(); }; }, [library.id]);
 useEffect(() => { const c = new AbortController(); statusKBase(library.id, c.signal).then(r => { if (!c.signal.aborted) setStatus(r.data || null); }).catch(e => { if (!c.signal.aborted) setStatusError(message(e)); }); return () => c.abort(); }, [library.id]);
 const search = async () => { searchAbort.current?.abort(); const c = new AbortController(); searchAbort.current = c; setSearching(true); setError(""); setResults(null); try { const r = await searchKBase(library.id, query.trim(), limit, c.signal, collections.length ? collections : undefined, method); if (!c.signal.aborted) setResults(r.data || null); } catch(e) { if (!c.signal.aborted) setError(message(e)); } finally { if (!c.signal.aborted) setSearching(false); } };
 const read = async (ref: string) => { readAbort.current?.abort(); const c = new AbortController(); readAbort.current = c; setOpen(true); setReading(true); setDocument(null); setError(""); try { const r = await readKBase(library.id, ref, c.signal); if (!c.signal.aborted) setDocument(r.data || null); } catch(e) { if (!c.signal.aborted) { setError(message(e)); setOpen(false); } } finally { if (!c.signal.aborted) setReading(false); } };
 return <>{error && <Alert type="error" message={error} />}<Tabs size="small" items={[
 { key: "search", label: t("kbases.recall"), children: <><Typography.Paragraph type="secondary">{t("kbases.recallHint")}</Typography.Paragraph>{statusError && <Alert type="warning" message={statusError} />}<div className={styles.retrievalOptions}>
  <label><span>{t("kbases.method")}</span><Select aria-label={t("kbases.method")} value={method} disabled={searching} onChange={v => { setMethod(v); setResults(null); }} options={[{ value: "query", label: t("kbases.methodQuery") }, { value: "search", label: t("kbases.methodSearch") }, { value: "vsearch", label: t("kbases.methodVector"), disabled: !status?.capabilities.vector?.complete || !status.capabilities.vector.queryModelConfigured }, { value: "gsearch", label: t("kbases.methodGraph"), disabled: !status?.capabilities.graph?.complete }]} /></label>
  <label className={styles.collectionFilter}><span>{t("kbases.collections")}</span><Select mode="multiple" allowClear aria-label={t("kbases.collections")} placeholder={t("kbases.allCollections")} value={collections} disabled={searching} onChange={v => { setCollections(v); setResults(null); }} options={libraryCollections(library).map(c => ({ value: c.name, label: c.name }))} /></label>
 </div>{status && (!status.capabilities.vector?.complete || !status.capabilities.vector.queryModelConfigured || !status.capabilities.graph?.complete) && <Typography.Paragraph type="secondary">{!status.capabilities.vector?.complete || !status.capabilities.vector.queryModelConfigured ? t("kbases.vectorUnavailable") : ""} {!status.capabilities.graph?.complete ? t("kbases.graphUnavailable") : ""}</Typography.Paragraph>}<div className={styles.search}><Input.Search aria-label={t("kbases.query")} placeholder={t("kbases.query")} value={query} maxLength={2000} onChange={e => setQuery(e.target.value)} enterButton={t("kbases.search")} loading={searching} onSearch={() => { if (query.trim()) void search(); }} /><label className={styles.limit}><span>{t("kbases.limit")}</span><InputNumber aria-label={t("kbases.limit")} min={1} max={50} value={limit} onChange={v => setLimit(v || 10)} /></label></div>{results && <><Typography.Paragraph>{t("kbases.hitCount", { count: results.results.length })}{results.trace?.coverage?.retrievalUsed?.length ? ` · ${t("kbases.channels")}: ${results.trace.coverage.retrievalUsed.map(channel => channelLabels[channel] || channel).join(", ")}` : ""}</Typography.Paragraph>{((Array.isArray(results.trace?.degraded) ? results.trace.degraded.length > 0 : results.trace?.degraded) || results.trace?.candidateBudgetExhausted) && <Alert type="warning" message={t("kbases.incomplete")} />}{results.results.length === 0 && <Empty description={t("kbases.noHits")} />}{results.results.map(hit => { const source = documentSource(hit); return <article key={hit.resultId} className={styles.hit}><div className={styles.hitHeading}><Button className={styles.documentLink} type="link" onClick={() => void read(hit.file)}>{hit.title || source.relativePath}</Button><Tag>{t("kbases.collection")}: {source.collection}</Tag><Tooltip title={t("kbases.similarityHint")}><Tag>{t("kbases.similarity")}: {hit.scoreType === "vector_similarity" && typeof hit.score === "number" && Number.isFinite(hit.score) ? hit.score.toFixed(4) : "—"}</Tag></Tooltip></div><div className={styles.path} title={hit.file}>{t("kbases.file")}: {source.relativePath}</div><div className={styles.hitRange} title={hit.chunk?.id}>{hit.chunk ? `${t("kbases.chunk")} ${hit.chunk.seq + 1} · ` : ""}{t("kbases.lines", { start: hit.evidence.range.lineStart, end: hit.evidence.range.lineEnd })}</div><pre>{hit.evidence.text}</pre></article>; })}</>}</> },
 { key: "files", label: `${t("kbases.files")} (${files.length})`, children: <Table<KnowledgeDocument> loading={fileLoading} rowKey="file" dataSource={files} size="small" pagination={{ pageSize: 20, showSizeChanger: false }} columns={[{ title: t("kbases.collection"), key: "collection", width: 130, render: (_, doc) => <Tag>{documentSource(doc).collection}</Tag> }, { title: t("kbases.file"), dataIndex: "file", render: (ref: string, doc) => <Button className={styles.documentLink} type="link" icon={<MaterialIcon name="description" />} onClick={() => void read(ref)}>{documentSource(doc).relativePath}</Button> }, { title: t("kbases.bytes"), dataIndex: "bytes", width: 100 }]} /> }
 ]} /><Drawer title={document?.file || t("kbases.preview")} open={open} width={720} onClose={() => { readAbort.current?.abort(); setOpen(false); }}><Spin spinning={reading}><pre className={styles.content}>{document?.evidence?.text || document?.body}</pre>{document?.readRange?.hasMore && <Alert type="info" message={t("kbases.previewLimit")} />}</Spin></Drawer></>;
}
