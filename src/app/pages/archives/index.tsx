import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArchiveConsole } from "@/features/settings/components/ArchiveConsole";
import type { ChatSummaryResponse } from "@/shared/data";
import { buildSurfaceRoute, readSurfacePresentationContext } from "@/features/surfaces/surfaceRoutes";

export const ArchivesPage = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const params = useParams<{ chatId?: string }>();
	const selectedChatId = String(params.chatId || "").trim();
	const routeSearch = location.search || "";

	const navigateToArchive = (chatId: string) => {
		const normalizedChatId = String(chatId || "").trim();
		navigate(
			normalizedChatId
				? `/archives/${encodeURIComponent(normalizedChatId)}${routeSearch}`
				: `/archives${routeSearch}`,
		);
	};

	const openRestoredChat = (summary: ChatSummaryResponse) => {
		const agentKey = String(summary.agentKey || "").trim();
		const chatId = String(summary.chatId || "").trim();
		if (!agentKey || !chatId) return;
		navigate(buildSurfaceRoute(
			{ kind: "agent", agentKey, chatId },
			readSurfacePresentationContext(location.search),
		));
	};

	return (
		<main className="archives-page">
			<ArchiveConsole
				active
				surface="page"
				showAgentFilter
				selectedChatId={selectedChatId}
				onSelectedChatIdChange={navigateToArchive}
				onOpenRestoredChat={openRestoredChat}
			/>
		</main>
	);
};
