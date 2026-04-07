import React from "react";
import { useAppDispatch } from "../../context/AppContext";
import {
	buildAttachmentPreviewState,
	canPreviewAttachment,
} from "../../lib/attachmentPreview";
import {
	type AttachmentLike,
	getAttachmentIconName,
	getAttachmentKind,
	getAttachmentUrl,
} from "../../lib/attachmentUtils";
import { MaterialIcon } from "./MaterialIcon";

interface AttachmentCardData extends AttachmentLike {
	name: string;
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
	const dispatch = useAppDispatch();
	const attachmentKind = getAttachmentKind(attachment);
	const sourceUrl = getAttachmentUrl(attachment);
	const preview = React.useMemo(
		() => buildAttachmentPreviewState(attachment),
		[attachment],
	);
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
	const canActivate =
		Boolean(sourceUrl) && status !== "uploading" && status !== "error";
	const classes = [
		"attachment-card",
		`attachment-card-${variant}`,
		`attachment-card-${density}`,
		hasImagePreview ? "is-image" : "is-file",
		canActivate ? "is-interactive" : "",
		status ? `is-${status}` : "",
	]
		.filter(Boolean)
		.join(" ");

	const triggerDownload = React.useCallback(() => {
		if (!sourceUrl || typeof document === "undefined") {
			return;
		}

		const anchor = document.createElement("a");
		anchor.href = sourceUrl;
		anchor.download = attachment.name;
		anchor.rel = "noopener";
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
	}, [attachment.name, sourceUrl]);

	const handleActivate = React.useCallback(() => {
		if (!canActivate) {
			return;
		}

		if (preview && canPreviewAttachment(attachment)) {
			dispatch({ type: "OPEN_ATTACHMENT_PREVIEW", preview });
			dispatch({ type: "SET_RIGHT_DRAWER_OPEN", open: true });
			dispatch({ type: "SET_LEFT_DRAWER_OPEN", open: false });
			return;
		}

		triggerDownload();
	}, [
		attachment,
		canActivate,
		dispatch,
		preview,
		triggerDownload,
	]);

	const handleKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (!canActivate) {
				return;
			}

			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				handleActivate();
			}
		},
		[canActivate, handleActivate],
	);

	return (
		<div
			className={classes}
			data-attachment-kind={attachmentKind}
			role={canActivate ? "button" : undefined}
			tabIndex={canActivate ? 0 : undefined}
			onClick={canActivate ? handleActivate : undefined}
			onKeyDown={canActivate ? handleKeyDown : undefined}
		>
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
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						onRemove();
					}}
					aria-label={removeLabel || `移除文件 ${attachment.name}`}
					title="移除文件"
				>
					<MaterialIcon name="close" />
				</button>
			) : null}
		</div>
	);
};
