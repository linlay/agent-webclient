import React from "react";
import { useAppState } from "@/app/state/AppContext";
import type { PublishedArtifact } from "@/app/state/types";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import { formatAttachmentSize } from "@/features/artifacts/lib/attachmentUtils";

export interface OverviewArtifactItem {
	artifactId: string;
	artifact: PublishedArtifact["artifact"];
	timestamp: number;
}

export function buildOverviewArtifactItems(
	artifacts: PublishedArtifact[],
): OverviewArtifactItem[] {
	return [...artifacts]
		.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
		.map((item) => ({
			artifactId: item.artifactId,
			artifact: item.artifact,
			timestamp: item.timestamp || 0,
		}));
}

const OverviewSection: React.FC<{
	title: string;
	count: number;
	children: React.ReactNode;
}> = ({ title, count, children }) => {
	return (
		<section className="right-sidebar-overview-section">
			<div className="right-sidebar-overview-section-head">
				<h3>{title}</h3>
				<span>{count}</span>
			</div>
			{children}
		</section>
	);
};

export const OverviewTab: React.FC = () => {
	const state = useAppState();
	const artifacts = React.useMemo(
		() => buildOverviewArtifactItems(state.artifacts),
		[state.artifacts],
	);

	return (
		<div className="right-sidebar-overview">
			<OverviewSection title="产出物" count={artifacts.length}>
				{artifacts.length === 0 ? (
					<div className="right-sidebar-empty">暂无产出物</div>
				) : (
					<ul className="artifact-drawer-list right-sidebar-artifact-list">
						{artifacts.map((item) => (
							<li key={item.artifactId} className="artifact-drawer-item">
								<AttachmentCard
									attachment={item.artifact}
									variant="composer"
									displayMode="file"
									density="compact"
									subtitle={formatAttachmentSize(item.artifact.sizeBytes)}
								/>
							</li>
						))}
					</ul>
				)}
			</OverviewSection>
		</div>
	);
};
