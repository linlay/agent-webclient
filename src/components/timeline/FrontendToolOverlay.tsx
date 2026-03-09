import React, { useEffect, useRef, useState } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { getViewport } from "../../lib/apiClient";
import { FRONTEND_VIEWPORT_TYPES } from "../../context/constants";
import { resolveToolLabel } from "../../lib/toolDisplay";

/**
 * FrontendToolOverlay — renders an active frontend tool in a full-overlay iframe.
 * This is for special tools like `launch_fireworks` that display visual effects.
 * When a tool with toolType in FRONTEND_VIEWPORT_TYPES is detected, this overlay
 * loads the viewport HTML and renders it as a full-screen iframe.
 */
export const FrontendToolOverlay: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const activeTool = state.activeFrontendTool;

	/* Auto-load viewport HTML when activeFrontendTool changes */
	useEffect(() => {
		if (
			!activeTool ||
			!activeTool.toolKey ||
			activeTool.viewportHtml ||
			activeTool.loading
		)
			return;

		// Mark as loading
		dispatch({
			type: "SET_ACTIVE_FRONTEND_TOOL",
			tool: { ...activeTool, loading: true, loadError: "" },
		});

		getViewport(activeTool.toolKey)
			.then((response) => {
				const data = response.data as Record<string, unknown>;
				const html =
					typeof data?.html === "string"
						? data.html
						: `<html><body><pre>${JSON.stringify(data ?? {}, null, 2)}</pre></body></html>`;

				dispatch({
					type: "SET_ACTIVE_FRONTEND_TOOL",
					tool: {
						...activeTool,
						viewportHtml: html,
						loading: false,
						loadError: "",
					},
				});
			})
			.catch((error) => {
				dispatch({
					type: "SET_ACTIVE_FRONTEND_TOOL",
					tool: {
						...activeTool,
						loading: false,
						loadError: `加载失败: ${(error as Error).message}`,
					},
				});
			});
	}, [activeTool, dispatch]);

	/* PostMessage to iframe when HTML is loaded */
	useEffect(() => {
		if (!activeTool?.viewportHtml || !iframeRef.current) return;

		const iframe = iframeRef.current;
		const handleLoad = () => {
			try {
				iframe.contentWindow?.postMessage(
					{
						type: "init",
						toolLabel: activeTool.toolLabel,
						toolName: activeTool.toolName,
						toolKey: activeTool.toolKey,
						params: activeTool.toolParams || {},
					},
					"*",
				);
			} catch (err) {
				console.warn("frontend tool postMessage failed:", err);
			}
		};

		iframe.addEventListener("load", handleLoad);
		return () => iframe.removeEventListener("load", handleLoad);
	}, [
		activeTool?.viewportHtml,
		activeTool?.toolName,
		activeTool?.toolKey,
		activeTool?.toolParams,
	]);

	/* Listen for messages from the iframe (e.g. tool completion) */
	useEffect(() => {
		const handler = (e: MessageEvent) => {
			if (
				!iframeRef.current ||
				e.source !== iframeRef.current.contentWindow
			)
				return;

			const data = e.data;
			if (data?.type === "close" || data?.type === "done") {
				dispatch({ type: "SET_ACTIVE_FRONTEND_TOOL", tool: null });
			}
		};
		window.addEventListener("message", handler);
		return () => window.removeEventListener("message", handler);
	}, [dispatch]);

	if (!activeTool) return null;
	const toolLabel = resolveToolLabel(activeTool);

	return (
		<div className="frontend-tool-overlay" id="frontend-tool-container">
			<div className="frontend-tool-header">
				<div className="frontend-tool-info">
					<strong id="frontend-tool-title">
						{toolLabel}
					</strong>
					{activeTool.description && (
						<span
							className="frontend-tool-meta"
							id="frontend-tool-meta"
						>
							{activeTool.description}
						</span>
					)}
				</div>
				<div className="frontend-tool-status-area">
					{activeTool.loading && (
						<span className="frontend-tool-status">加载中...</span>
					)}
					{activeTool.loadError && (
						<span className="frontend-tool-status err">
							{activeTool.loadError}
						</span>
					)}
				</div>
			</div>
			<div className="frontend-tool-body">
				{activeTool.viewportHtml && (
					<iframe
						ref={iframeRef}
						id="frontend-tool-frame"
						className="frontend-tool-frame"
						srcDoc={activeTool.viewportHtml}
						sandbox="allow-scripts allow-same-origin allow-popups"
						title={`frontend-tool-${activeTool.toolKey}`}
					/>
				)}
			</div>
		</div>
	);
};
