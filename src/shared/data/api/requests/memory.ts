import { requestJson } from "@/shared/data/api/http";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import type { MemoryDocument, MemoryKind, MemoryDates, MemoryMatches } from "@/shared/data/memory/memoryTypes";
export function getMemoryFile(kind: MemoryKind, date = "") {
    return requestJson<MemoryDocument>(`${dataEndpoints.memoryFile.path}?${new URLSearchParams({ kind, date })}`);
}
export function saveMemoryFile(document: MemoryDocument) {
    const { kind, date, content, revision } = document;
    return requestJson<MemoryDocument>(dataEndpoints.memoryFileSave.path, { method: "PUT", body: JSON.stringify({ kind, date, content, revision }) });
}
export function deleteMemoryFile(document: MemoryDocument) {
    const { kind, date, revision } = document;
    return requestJson<MemoryDocument>(dataEndpoints.memoryFileDelete.path, { method: "DELETE", body: JSON.stringify({ kind, date, revision }) });
}
export function getMemoryDates(before = "") {
    return requestJson<MemoryDates>(`${dataEndpoints.memoryDaily.path}?${new URLSearchParams({ before })}`);
}
export function searchMemoryFiles(query: string, before = "") {
    return requestJson<MemoryMatches>(`${dataEndpoints.memorySearch.path}?${new URLSearchParams({ query, before })}`);
}
