import React from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { AppProvider, useAppState } from "@/app/state/AppContext";
import { AppShell } from "@/app/layout/AppShell";

const ThemedAppShell: React.FC = () => {
	const { themeMode } = useAppState();
	const isDark = themeMode === "dark";

	return (
		<ConfigProvider
			theme={{
				algorithm: isDark
					? antdTheme.darkAlgorithm
					: antdTheme.defaultAlgorithm,
				token: isDark
					? {
							colorPrimary: "#4f88ff",
							colorSuccess: "#27c346",
							colorWarning: "#ff9a2e",
							colorError: "#f76560",
							colorInfo: "#a55eea",
							colorBgBase: "#0d0e10",
							colorBgLayout: "#0d0e10",
							colorBgContainer: "#161719",
							colorBgElevated: "#161719",
							colorText: "#f2f3f5",
							colorTextSecondary: "#c9cdd4",
							colorTextTertiary: "#86909c",
							colorBorder: "rgba(255, 255, 255, 0.08)",
							colorBorderSecondary: "rgba(255, 255, 255, 0.14)",
							borderRadius: 8,
							controlHeight: 32,
							fontFamily:
								'"Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif',
					  }
					: {
							colorPrimary: "#2663eb",
							colorSuccess: "#00b42a",
							colorWarning: "#ff7d00",
							colorError: "#f53f3f",
							colorInfo: "#722ed1",
							colorBgBase: "#f2f3f5",
							colorBgLayout: "#f2f3f5",
							colorBgContainer: "#ffffff",
							colorBgElevated: "#ffffff",
							colorText: "#1d2129",
							colorTextSecondary: "#4e5969",
							colorTextTertiary: "#86909c",
							colorBorder: "#e5e6eb",
							colorBorderSecondary: "#c9cdd4",
							borderRadius: 8,
							controlHeight: 32,
							fontFamily:
								'"Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif',
					  },
			}}
		>
			<AppShell />
		</ConfigProvider>
	);
};

const App: React.FC = () => {
	return (
		<AppProvider>
			<ThemedAppShell />
		</AppProvider>
	);
};

export default App;
