import React from "react";
import {
	getAttachmentIconName,
	getAttachmentKind,
	getAttachmentUrl,
} from "../../lib/attachmentUtils";
import { MaterialIcon } from "./MaterialIcon";

interface AttachmentCardData {
	name: string;
	size?: number;
	type?: string;
	mimeType?: string;
	url?: string;
	previewUrl?: string;
}

interface AttachmentCardProps {
	attachment: AttachmentCardData;
	variant: "composer" | "timeline";
	status?: "uploading" | "ready" | "error";
	displayMode?: "auto" | "file" | "preview";
	density?: "default" | "compact";
	thumbnailMode?: "auto" | "icon" | "inline";
	subtitle?: string;
	trailingNode?: React.ReactNode;
	onRemove?: () => void;
	removeLabel?: string;
}

export const AttachmentCard: React.FC<AttachmentCardProps> = ({
	attachment,
	variant,
	status,
	displayMode = "auto",
	density = "default",
	thumbnailMode = "auto",
	subtitle = "",
	trailingNode,
	onRemove,
	removeLabel,
}) => {
	const attachmentKind = getAttachmentKind(attachment);
	const sourceUrl = getAttachmentUrl(attachment);
	const [imageFailed, setImageFailed] = React.useState(false);

	React.useEffect(() => {
		setImageFailed(false);
	}, [sourceUrl]);

	const wantsPreview =
		displayMode === "preview" ||
		(displayMode === "auto" && attachmentKind === "image");
	const hasImagePreview = wantsPreview && Boolean(sourceUrl) && !imageFailed;
	const hasInlineThumbnail =
		!hasImagePreview &&
		thumbnailMode === "inline" &&
		attachmentKind === "image" &&
		Boolean(sourceUrl) &&
		!imageFailed;
	const classes = [
		"attachment-card",
		`attachment-card-${variant}`,
		`attachment-card-${density}`,
		hasImagePreview ? "is-image" : "is-file",
		status ? `is-${status}` : "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<div className={classes} data-attachment-kind={attachmentKind}>
			{hasImagePreview ? (
				<div className="attachment-card-image-shell">
					<img
						className="attachment-card-image"
						src={sourceUrl}
						alt={attachment.name}
						loading="lazy"
						onError={() => setImageFailed(true)}
					/>
					{subtitle ? (
						<span className="attachment-card-image-badge">
							{subtitle}
						</span>
					) : null}
				</div>
			) : (
				<div className="attachment-card-file-shell">
					{hasInlineThumbnail ? (
						<span className="attachment-card-file-icon is-thumbnail">
							<img
								className="attachment-card-file-thumb"
								src={sourceUrl}
								alt={attachment.name}
								loading="lazy"
								onError={() => setImageFailed(true)}
							/>
						</span>
					) : (
						<span className="attachment-card-file-icon">
							<MaterialIcon
								name={getAttachmentIconName(attachment)}
							/>
						</span>
					)}
					<span className="attachment-card-file-copy">
						<span
							className="attachment-card-title"
							title={attachment.name}
						>
							{attachment.name}
						</span>
						{subtitle ? (
							<span
								className="attachment-card-subtitle"
								title={subtitle}
							>
								{subtitle}
							</span>
						) : null}
					</span>
					{trailingNode ? (
						<span className="attachment-card-trailing">
							{trailingNode}
						</span>
					) : null}
				</div>
			)}
			{onRemove ? (
				<button
					type="button"
					className="attachment-card-remove"
					onClick={onRemove}
					aria-label={removeLabel || `移除文件 ${attachment.name}`}
					title="移除文件"
				>
					<MaterialIcon name="close" />
				</button>
			) : null}
		</div>
	);
};
