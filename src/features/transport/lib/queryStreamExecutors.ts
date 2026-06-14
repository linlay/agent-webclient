import type { TransportMode } from "@/features/transport/lib/transportMode";
import { executeQueryStreamSse } from "@/features/transport/lib/queryStreamRuntime.sse";
import { executeQueryStreamWs } from "@/features/transport/lib/queryStreamRuntime.ws";
import { executeAttachRunSse } from "@/features/transport/lib/queryStreamRuntime.sse";
import type {
	AttachStreamExecutor,
	QueryStreamExecutor,
} from "@/features/transport/lib/queryStreamShared";

export function resolveQueryStreamExecutor(
	transportMode: TransportMode,
): QueryStreamExecutor {
	return transportMode === "sse" ? executeQueryStreamSse : executeQueryStreamWs;
}

export function resolveAttachStreamExecutor(
	_transportMode: TransportMode,
): AttachStreamExecutor {
	return executeAttachRunSse;
}
