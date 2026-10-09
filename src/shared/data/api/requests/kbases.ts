import { dataEndpoints } from "../endpoints";
import { requestJson, requestWithAuth } from "../http";
import type { KnowledgeBase, KnowledgeBaseInput, KnowledgeDocument, KnowledgeSearch, KnowledgeRead, KnowledgeBaseStatus, RetrievalMethod } from "../dto/kbases";
const root = dataEndpoints.adminKBases.path;
const path = (id: string) => `${root}/${encodeURIComponent(id)}`;
export const listKBases = () => requestJson<KnowledgeBase[]>(root, { cache: "no-store" });
export const saveKBase = (input: KnowledgeBaseInput, id?: string) => requestJson<KnowledgeBase>(id ? path(id) : root, { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
export const deleteKBase = (id: string) => requestJson(`${path(id)}`, { method: "DELETE" });
export const refreshKBase = (id: string) => requestJson<KnowledgeBase>(`${path(id)}/refresh`, { method: "POST" });
export const filesKBase = (id: string, signal?: AbortSignal) => requestJson<{ documents: KnowledgeDocument[]; complete: boolean }>(`${path(id)}/files`, { signal });
export const statusKBase = (id: string, signal?: AbortSignal) => requestJson<KnowledgeBaseStatus>(`${path(id)}/status`, { signal });
export const searchKBase = (id: string, query: string, limit: number, signal?: AbortSignal, collections?: string[], method: RetrievalMethod = "query") => requestJson<KnowledgeSearch>(`${path(id)}/search`, { method: "POST", body: JSON.stringify({ query, limit, collections, method }), signal });
export const readKBase = (id: string, ref: string, signal?: AbortSignal) => requestJson<KnowledgeRead>(`${path(id)}/read?ref=${encodeURIComponent(ref)}`, { signal });

export interface PublishedKnowledgeText { content?: string; hasMore?: boolean; startLine?: number; endLine?: number; }
export const readPublishedKnowledge = (chatId: string, sourceId: string, offset: number, signal?: AbortSignal) => requestJson<PublishedKnowledgeText>(dataEndpoints.knowledgeSourceRead.path, { method: "POST", body: JSON.stringify({chatId, sourceId, offset, limit: 200}), signal });
export async function downloadPublishedKnowledge(chatId: string, sourceId: string, signal?: AbortSignal): Promise<Blob> {
 const response = await requestWithAuth(dataEndpoints.knowledgeSourceFile.path, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({chatId,sourceId}), signal });
 if (!response.ok) throw new Error(await response.text());
 return response.blob();
}
