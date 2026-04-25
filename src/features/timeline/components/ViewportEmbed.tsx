import React, { useCallback, useEffect, useRef, useState } from "react";
import { getViewport } from "@/features/transport/lib/apiClientProxy";

interface ViewportEmbedProps {
	viewportKey: string;
	signature: string;
	payload?: unknown;
	payloadRaw?: string;
}

export interface ViewportInitFrame {
	addEventListener: (
		type: "load",
		listener: () => void,
	) => void;
	removeEventListener: (
		type: "load",
		listener: () => void,
	) => void;
}

export function bindViewportInitListener(
	frame: ViewportInitFrame,
	sendInit: () => void,
): () => void {
	frame.addEventListener("load", sendInit);
	sendInit();
	return () => {
		frame.removeEventListener("load", sendInit);
	};
}

export function shouldPostViewportUpdate(input: {
	html: string;
	currentFrameKey: string;
	expectedFrameKey: string;
	lastPostedSignature: string;
	signature: string;
}): boolean {
	if (!input.html) {
		return false;
	}
	if (input.currentFrameKey !== input.expectedFrameKey) {
		return false;
	}
	return input.lastPostedSignature !== input.signature;
}

/**
 * ViewportEmbed — renders a single embedded viewport.
 * Calls /api/viewport?viewportKey=<key> to fetch HTML,
 * renders it in an iframe, then postMessage(payload) to the iframe
 * so the viewport HTML can populate its data.
 */
export const ViewportEmbed: React.FC<ViewportEmbedProps> = ({
	viewportKey,
	signature,
	payload,
	payloadRaw,
}) => {
	const [html, setHtml] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const loadedRef = useRef(false);
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const currentFrameKeyRef = useRef("");
	const lastPostedSignatureRef = useRef("");

	useEffect(() => {
		if (!viewportKey || loadedRef.current) return;
		loadedRef.current = true;
		setLoading(true);

		getViewport(viewportKey)
			.then((response) => {
				const data = response.data as Record<string, unknown>;
				const responseHtml = data?.html;
				if (typeof responseHtml !== "string" || !responseHtml.trim()) {
					throw new Error("Viewport response does not contain html");
				}
				setHtml(responseHtml);
				setError("");
			})
			.catch((err) => {
				setError(`视图加载失败: ${(err as Error).message}`);
			})
			.finally(() => {
				setLoading(false);
			});
	}, [viewportKey]);

	const postToFrame = useCallback(() => {
		const iframe = iframeRef.current;
		if (!iframe?.contentWindow) return;

		try {
			const messagePayload = payload ?? safeJsonParse(payloadRaw || "{}", {});
			iframe.contentWindow.postMessage(messagePayload, "*");
			lastPostedSignatureRef.current = signature;
		} catch (err) {
			console.warn("viewport postMessage failed:", err);
		}

		resizeIframe(iframe);
	}, [payload, payloadRaw, signature]);

	useEffect(() => {
		currentFrameKeyRef.current = "";
		lastPostedSignatureRef.current = "";
	}, [html, viewportKey]);

	useEffect(() => {
		if (!html || !iframeRef.current) return;

		const iframe = iframeRef.current;
		const expectedKey = `${viewportKey}::${html}`;
		const sendInit = () => {
			currentFrameKeyRef.current = expectedKey;
			postToFrame();
		};

		return bindViewportInitListener(iframe, sendInit);
	}, [html, postToFrame, viewportKey]);

	useEffect(() => {
		const expectedFrameKey = `${viewportKey}::${html}`;
		if (
			!shouldPostViewportUpdate({
				html,
				currentFrameKey: currentFrameKeyRef.current,
				expectedFrameKey,
				lastPostedSignature: lastPostedSignatureRef.current,
				signature,
			})
		) {
			return;
		}

		postToFrame();
	}, [html, postToFrame, signature, viewportKey]);

	return (
		<div className="timeline-content-viewport">
			<div className="timeline-content-viewport-body">
				{loading && <div className="status-line">加载视图中...</div>}
				{error && <div className="system-alert">{error}</div>}
				{html && (
					<iframe
						ref={iframeRef}
						className="timeline-content-viewport-frame"
						srcDoc={html}
						sandbox="allow-scripts allow-same-origin"
						title={`viewport-${viewportKey}`}
					/>
				)}
			</div>
		</div>
	);
};

function safeJsonParse(text: string, fallback: unknown): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return fallback;
	}
}

function resizeIframe(iframe: HTMLIFrameElement): void {
	try {
		const doc = iframe.contentDocument || iframe.contentWindow?.document;
		if (doc?.body) {
			const height = Math.max(doc.body.scrollHeight, 100);
			iframe.style.height = `${height + 16}px`;

			setTimeout(() => {
				try {
					const nextHeight = Math.max(doc.body.scrollHeight, 100);
					iframe.style.height = `${nextHeight + 16}px`;
				} catch {
					/* ignore */
				}
			}, 500);
			return;
		}
	} catch {
		/* ignore */
	}

	iframe.style.height = "300px";
}
