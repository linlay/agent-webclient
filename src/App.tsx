import React from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { AppProvider, useAppState } from "./context/AppContext";
import { AppShell } from "./components/layout/AppShell";

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
							colorPrimary: "#4f9cff",
							colorSuccess: "#2cd2a0",
							colorWarning: "#f2b34a",
							colorError: "#ff6e87",
							colorBgBase: "#0b1422",
							colorBgLayout: "#0b1422",
							colorBgContainer: "#16263d",
							colorBgElevated: "#16263d",
							colorText: "#eaf3ff",
							colorTextSecondary: "#c3d5ef",
							colorTextTertiary: "#89a5cc",
							colorBorder: "rgba(128, 170, 230, 0.2)",
							colorBorderSecondary: "rgba(128, 170, 230, 0.34)",
							borderRadius: 12,
					  }
					: {
							colorPrimary: "#1677ff",
							colorSuccess: "#0dbf8f",
							colorWarning: "#d88b22",
							colorError: "#d33b58",
							colorBgBase: "#f5f7fb",
							colorBgLayout: "#f5f7fb",
							colorBgContainer: "#ffffff",
							colorBgElevated: "#ffffff",
							colorText: "#0f1f35",
							colorTextSecondary: "#2f445f",
							colorTextTertiary: "#6b7f99",
							colorBorder: "rgba(22, 53, 93, 0.14)",
							colorBorderSecondary: "rgba(22, 53, 93, 0.28)",
							borderRadius: 12,
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
