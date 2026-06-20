import React from "react";
import { Modal } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import { t } from "@/shared/i18n";
import {
	ArchiveConsole,
	buildArchiveBulkCandidates,
	extractArchivePreviewLines,
} from "@/features/settings/components/ArchiveConsole";

export { buildArchiveBulkCandidates, extractArchivePreviewLines };

export const ArchiveModal: React.FC = () => {
	const { state, dispatch } = useAppContext();

	return (
		<Modal
			open={state.archiveOpen}
			onCancel={() => dispatch({ type: "SET_ARCHIVE_OPEN", open: false })}
			footer={null}
			destroyOnHidden
			width="min(1080px, calc(100vw - 32px))"
			className="archive-modal"
			title={t("archive.title")}
		>
			<ArchiveConsole active={state.archiveOpen} surface="modal" />
		</Modal>
	);
};
