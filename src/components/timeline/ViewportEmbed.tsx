import React, { useEffect, useState, useRef } from "react";
import { getViewport } from "../../lib/apiClientProxy";

interface ViewportEmbedProps {
	viewportKey: string;
	signature: string;
	payload?: unknown;
	payloadRaw?: string;
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

	/* When iframe loads, postMessage the payload data to it */
	useEffect(() => {
		if (!html || !iframeRef.current) return;

		const iframe = iframeRef.current;
		const handleLoad = () => {
			try {
				/* Send payload to the viewport HTML via postMessage,
				   matching the original viewportRuntime.js behavior */
				const messagePayload =
					payload ?? safeJsonParse(payloadRaw || "{}", {});
				iframe.contentWindow?.postMessage(messagePayload, "*");
			} catch (err) {
				console.warn("viewport postMessage failed:", err);
			}

			/* Auto-resize iframe to fit content */
			try {
				const doc =
					iframe.contentDocument || iframe.contentWindow?.document;
				if (doc?.body) {
					const height = Math.max(doc.body.scrollHeight, 100);
					iframe.style.height = `${height + 16}px`;

					/* Re-measure after a short delay (for async rendering inside) */
					setTimeout(() => {
						try {
							const h = Math.max(doc.body.scrollHeight, 100);
							iframe.style.height = `${h + 16}px`;
						} catch {
							/* ignore */
						}
					}, 500);
				}
			} catch {
				iframe.style.height = "300px";
			}
		};

		iframe.addEventListener("load", handleLoad);
		return () => iframe.removeEventListener("load", handleLoad);
	}, [html, payload, payloadRaw]);

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
