import React, { useEffect } from "react";
import { App as AntdApp } from "antd";
import { useAppState } from "@/app/state/AppContext";

const COMMAND_STATUS_MESSAGE_KEY = "command-status";
// 消息浮层始终挂载一个隐藏的 live region；antd message 自身不带 ARIA 播报。
const liveRegionStyle: React.CSSProperties = {
	position: "absolute",
	width: 1,
	height: 1,
	margin: -1,
	padding: 0,
	border: 0,
	overflow: "hidden",
	clip: "rect(0 0 0 0)",
	whiteSpace: "nowrap",
};

/**
 * 把全局命令状态投影为 Ant Design message：pending 用 loading，
 * 完成/失败用同一 key 原地更新，收起仍由 AppState 的计时器驱动。
 */
export const CommandStatusOverlay: React.FC = () => {
	const overlay = useAppState().commandStatusOverlay;
	const { message } = AntdApp.useApp();

	useEffect(() => {
		if (!overlay.visible) {
			message.destroy(COMMAND_STATUS_MESSAGE_KEY);
			return;
		}
		message.open({
			key: COMMAND_STATUS_MESSAGE_KEY,
			type: overlay.phase === "pending" ? "loading" : overlay.phase,
			content: (
				<span style={{ display: "inline-block", maxWidth: "min(420px, calc(100vw - 32px))", textAlign: "start" }}>
					{overlay.text}
				</span>
			),
			duration: 0,
		});
	}, [message, overlay.phase, overlay.text, overlay.visible]);

	useEffect(() => () => {
		message.destroy(COMMAND_STATUS_MESSAGE_KEY);
	}, [message]);

	return (
		<span role="status" aria-live="polite" aria-atomic="true" style={liveRegionStyle}>
			{overlay.visible ? overlay.text : ""}
		</span>
	);
};
