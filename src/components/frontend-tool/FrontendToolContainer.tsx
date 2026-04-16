import React, { useEffect, useRef, useState } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { getViewport, submitTool } from "../../lib/apiClientProxy";
import { resolveToolLabel } from "../../lib/toolDisplay";

export const FrontendToolContainer: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const tool = state.activeFrontendTool;
	const iframeRef = useRef<HTMLIFrameElement | null>(null);
	const [statusText, setStatusText] = useState("");
	const [statusTone, setStatusTone] = useState<"normal" | "ok" | "err">(
		"normal",
	);

	useEffect(() => {
		if (!tool || tool.loading || tool.viewportHtml || !tool.viewportKey)
			return;

		const expectedKey = tool.key;
		dispatch({
			type: "SET_ACTIVE_FRONTEND_TOOL",
			tool: { ...tool, loading: true, loadError: "" },
		});

		getViewport(tool.viewportKey)
			.then((response) => {
				if (state.activeFrontendTool?.key !== expectedKey) return;
				const payload = response.data as Record<string, unknown> | null;
				const html =
					typeof payload?.html === "string"
						? payload.html
						: `<html><body><pre>${JSON.stringify(payload ?? {}, null, 2)}</pre></body></html>`;

				dispatch({
					type: "SET_ACTIVE_FRONTEND_TOOL",
					tool: {
						...state.activeFrontendTool,
						viewportHtml: html,
						loading: false,
						loadError: "",
					},
				});
			})
			.catch((error) => {
				if (state.activeFrontendTool?.key !== expectedKey) return;
				dispatch({
					type: "SET_ACTIVE_FRONTEND_TOOL",
					tool: {
						...state.activeFrontendTool,
						loading: false,
						loadError: `前端工具加载失败: ${(error as Error).message}`,
					},
				});
			});
	}, [tool, dispatch, state.activeFrontendTool]);

	useEffect(() => {
		if (!tool) return;
		setStatusText("");
		setStatusTone("normal");
	}, [tool?.key]);

	useEffect(() => {
		if (!tool?.viewportHtml || !iframeRef.current) return;
		const iframe = iframeRef.current;
		const expectedKey = tool.key;
		const postInit = () => {
			if (state.activeFrontendTool?.key !== expectedKey) return;
			iframe.contentWindow?.postMessage(
				{
					type: "tool_init",
					data: {
						runId: tool.runId,
						toolId: tool.toolId,
						viewportKey: tool.viewportKey,
						toolType: tool.toolType,
						toolTimeout: tool.toolTimeout,
						params: tool.toolParams || {},
					},
				},
				"*",
			);
		};
		iframe.addEventListener("load", postInit);
		postInit();
		return () => iframe.removeEventListener("load", postInit);
	}, [tool, state.activeFrontendTool]);

	useEffect(() => {
		const onMessage = async (event: MessageEvent) => {
			const active = state.activeFrontendTool;
			if (!active || !iframeRef.current) return;
			if (event.source !== iframeRef.current.contentWindow) return;

			const data = event.data;
			if (!data || typeof data !== "object") return;

			if (data.type === "frontend_submit") {
				setStatusText("提交中...");
				setStatusTone("normal");
				try {
					const params =
						data.params && typeof data.params === "object"
							? data.params
							: {};
					const response = await submitTool({
						runId: active.runId,
						toolId: active.toolId,
						params: params as Record<string, unknown>,
					});
					const accepted = Boolean(
						(response.data as Record<string, unknown>)?.accepted,
					);
					const detail = String(
						(response.data as Record<string, unknown>)?.detail ||
							(accepted ? "accepted" : "unmatched"),
					);

					if (accepted) {
						setStatusText(`提交成功：${detail}`);
						setStatusTone("ok");
						dispatch({
							type: "SET_ACTIVE_FRONTEND_TOOL",
							tool: null,
						});
					} else {
						setStatusText(`提交未命中：${detail}`);
						setStatusTone("err");
					}
				} catch (error) {
					setStatusText(`提交失败：${(error as Error).message}`);
					setStatusTone("err");
				}
				return;
			}

			if (data.type === "close" || data.type === "done") {
				dispatch({ type: "SET_ACTIVE_FRONTEND_TOOL", tool: null });
			}
		};

		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [dispatch, state.activeFrontendTool]);

	if (!tool) return null;
	const toolLabel = resolveToolLabel(tool);

	return (
		<div className="frontend-tool-container" id="frontend-tool-container">
			<div className="frontend-tool-header">
				<strong className="frontend-tool-title">
					{toolLabel}
				</strong>
				<span className="frontend-tool-meta">
					{tool.toolType} · {tool.toolId}
				</span>
			</div>

			{tool.loading && (
				<div className="status-line" style={{ margin: "8px" }}>
					加载中...
				</div>
			)}
			{tool.loadError && (
				<div className="system-alert" style={{ margin: "8px" }}>
					{tool.loadError}
				</div>
			)}

			{tool.viewportHtml && (
				<iframe
					ref={iframeRef}
					className="frontend-tool-frame"
					id="frontend-tool-frame"
					srcDoc={tool.viewportHtml}
					sandbox="allow-scripts allow-popups allow-same-origin"
					title="frontend-tool"
				/>
			)}

			<div
				className={`frontend-tool-status ${statusTone === "ok" ? "ok" : statusTone === "err" ? "err" : ""}`.trim()}
				id="frontend-tool-status"
			>
				{statusText}
			</div>
		</div>
	);
};
