import React from "react";
import type { CurrentWorkerDetailView } from "@/features/workers/lib/currentWorker";
import { useI18n } from "@/shared/i18n";
import { UiTag } from "@/shared/ui/UiTag";

export const DetailModal: React.FC<{
	detailView: CurrentWorkerDetailView;
}> = ({ detailView }) => {
	const { t } = useI18n();
	const isTeamDetail = detailView.identifierLabel === "teamId";

	return (
		<div className="command-modal-section command-detail-grid">
			<div className="command-detail-card">
				<span className="command-detail-label">{t("detail.label.name")}</span>
				<strong>{detailView.title}</strong>
			</div>
			<div className="command-detail-card">
				<span className="command-detail-label">{detailView.identifierLabel}</span>
				<strong>{detailView.identifierValue}</strong>
			</div>
			<div className="command-detail-card">
				<span className="command-detail-label">{t("detail.label.role")}</span>
				<strong>{detailView.role}</strong>
			</div>
			<div className="command-detail-card">
				<span className="command-detail-label">{t("detail.label.model")}</span>
				<strong>{detailView.model}</strong>
			</div>

			<div className="command-detail-block">
				<h4>{t("detail.section.skills")}</h4>
				<div className="command-tag-list">
					{detailView.skills.length > 0 ? detailView.skills.map((item) => (
						<UiTag key={item} tone="accent">{item}</UiTag>
					)) : <span className="command-empty-inline">{t("detail.noValue")}</span>}
				</div>
			</div>

			<div className="command-detail-block">
				<h4>{t("detail.section.tools")}</h4>
				<div className="command-tag-list">
					{detailView.tools.length > 0 ? detailView.tools.map((item) => (
						<UiTag key={item} tone="default">{item}</UiTag>
					)) : <span className="command-empty-inline">{t("detail.noValue")}</span>}
				</div>
			</div>

			{isTeamDetail && (
				<div className="command-detail-block">
					<h4>{t("detail.section.members")}</h4>
					<div className="command-tag-list">
						{detailView.members.length > 0 ? detailView.members.map((item) => (
							<UiTag key={item} tone="muted">{item}</UiTag>
						)) : <span className="command-empty-inline">{t("detail.noValue")}</span>}
					</div>
				</div>
			)}

			<div className="command-detail-block command-raw-block">
				<h4>{t("detail.rawMetadata")}</h4>
				<pre>{detailView.rawJson}</pre>
			</div>
		</div>
	);
};
