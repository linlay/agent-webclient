import React, { useEffect, useRef, useState } from "react";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import { getViewport, submitTool } from "@/shared/data";
import { resolveToolLabel } from "@/features/timeline/lib/toolDisplay";
import { useI18n } from "@/shared/i18n";

const FRONTEND_TOOL_CONTAINER_CLASS_NAME =
	"frontend-tool-container tw:mb-0 tw:overflow-hidden tw:rounded-2xl tw:border tw:[border-color:color-mix(in_srgb,var(--accent-electric)_26%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_96%,transparent)] tw:shadow-elevated tw:[.layout-copilot_&]:rounded-[10px]";

const FRONTEND_TOOL_HEADER_CLASS_NAME =
	"frontend-tool-header tw:flex tw:items-center tw:justify-between tw:border-b tw:border-line-soft tw:bg-[color-mix(in_srgb,var(--accent-soft)_28%,transparent)] tw:px-3.5 tw:py-2 tw:[.layout-copilot_&]:px-2.5 tw:[.layout-copilot_&]:py-[7px]";

const FRONTEND_TOOL_META_CLASS_NAME =
	"frontend-tool-meta tw:font-code tw:text-[10px] tw:text-ink-muted";

const FRONTEND_TOOL_FRAME_CLASS_NAME =
	"frontend-tool-frame tw:w-full tw:max-h-[70vh] tw:border-0 tw:[.layout-copilot_&]:h-[min(320px,44vh)]";

const FRONTEND_TOOL_STATUS_CLASS_NAME_BY_TONE = {
	normal:
		"frontend-tool-status tw:min-h-0 tw:border-t tw:border-line-soft tw:px-3.5 tw:py-1.5 tw:text-[11px] tw:text-ink-muted",
	ok: "frontend-tool-status tw:min-h-0 tw:border-t tw:border-line-soft tw:px-3.5 tw:py-1.5 tw:text-[11px] tw:text-accent-lime",
	err: "frontend-tool-status tw:min-h-0 tw:border-t tw:border-line-soft tw:px-3.5 tw:py-1.5 tw:text-[11px] tw:text-accent-danger",
} satisfies Record<"normal" | "ok" | "err", string>;

export const FrontendToolContainer: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const { t } = useI18n();
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
						loadError: t("frontendTool.loadFailed", { detail: (error as Error).message }),
					},
				});
			});
	}, [tool, dispatch, state.activeFrontendTool, t]);

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
				setStatusText(t("frontendTool.submitting"));
				setStatusTone("normal");
				if (!active.agentKey) {
					setStatusText(t("frontendTool.agentKeyRequired"));
					setStatusTone("err");
					return;
				}
				try {
					const params =
						data.params && typeof data.params === "object"
							? data.params
							: {};
					const response = await submitTool({
						runId: active.runId,
						agentKey: active.agentKey,
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
						setStatusText(t("frontendTool.submitted", { detail }));
						setStatusTone("ok");
						dispatch({
							type: "SET_ACTIVE_FRONTEND_TOOL",
							tool: null,
						});
					} else {
						setStatusText(t("frontendTool.unmatched", { detail }));
						setStatusTone("err");
					}
				} catch (error) {
					setStatusText(t("frontendTool.submitFailed", { detail: (error as Error).message }));
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
	}, [dispatch, state.activeFrontendTool, t]);

	if (!tool) return null;
	const toolLabel = resolveToolLabel(tool);

	return (
		<div
			className={FRONTEND_TOOL_CONTAINER_CLASS_NAME}
			id="frontend-tool-container"
		>
			<div className={FRONTEND_TOOL_HEADER_CLASS_NAME}>
				<strong className="frontend-tool-title">
					{toolLabel}
				</strong>
				<span className={FRONTEND_TOOL_META_CLASS_NAME}>
					{tool.toolType} · {tool.toolId}
				</span>
			</div>

			{tool.loading && (
				<div className="status-line tw:m-2">
					{t("frontendTool.loading")}
				</div>
			)}
			{tool.loadError && (
				<div className="system-alert tw:m-2">
					{tool.loadError}
				</div>
			)}

			{tool.viewportHtml && (
				<iframe
					ref={iframeRef}
					className={FRONTEND_TOOL_FRAME_CLASS_NAME}
					id="frontend-tool-frame"
					srcDoc={tool.viewportHtml}
					sandbox="allow-scripts allow-popups allow-same-origin"
					title={t("frontendTool.frameTitle")}
				/>
			)}

			<div
				className={FRONTEND_TOOL_STATUS_CLASS_NAME_BY_TONE[statusTone]}
				id="frontend-tool-status"
			>
				{statusText}
			</div>
		</div>
	);
};
