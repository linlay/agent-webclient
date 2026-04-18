import React from "react";
import type { CurrentWorkerDetailView } from "@/features/workers/lib/currentWorker";
import { UiTag } from "@/shared/ui/UiTag";

export const DetailModal: React.FC<{
	detailView: CurrentWorkerDetailView;
}> = ({ detailView }) => {
	return (
		<div className="command-modal-section command-detail-grid">
			<div className="command-detail-card">
				<span className="command-detail-label">名称</span>
				<strong>{detailView.title}</strong>
			</div>
			<div className="command-detail-card">
				<span className="command-detail-label">{detailView.identifierLabel}</span>
				<strong>{detailView.identifierValue}</strong>
			</div>
			<div className="command-detail-card">
				<span className="command-detail-label">角色</span>
				<strong>{detailView.role}</strong>
			</div>
			<div className="command-detail-card">
				<span className="command-detail-label">模型</span>
				<strong>{detailView.model}</strong>
			</div>

			<div className="command-detail-block">
				<h4>技能</h4>
				<div className="command-tag-list">
					{detailView.skills.length > 0 ? detailView.skills.map((item) => (
						<UiTag key={item} tone="accent">{item}</UiTag>
					)) : <span className="command-empty-inline">未提供</span>}
				</div>
			</div>

			<div className="command-detail-block">
				<h4>工具</h4>
				<div className="command-tag-list">
					{detailView.tools.length > 0 ? detailView.tools.map((item) => (
						<UiTag key={item} tone="default">{item}</UiTag>
					)) : <span className="command-empty-inline">未提供</span>}
				</div>
			</div>

			{detailView.kindLabel === "小组" && (
				<div className="command-detail-block">
					<h4>成员</h4>
					<div className="command-tag-list">
						{detailView.members.length > 0 ? detailView.members.map((item) => (
							<UiTag key={item} tone="muted">{item}</UiTag>
						)) : <span className="command-empty-inline">未提供</span>}
					</div>
				</div>
			)}

			<div className="command-detail-block command-raw-block">
				<h4>Raw Metadata</h4>
				<pre>{detailView.rawJson}</pre>
			</div>
		</div>
	);
};
