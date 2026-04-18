import React from "react";

interface UserBubbleProps {
	text: string;
	variant?: "default" | "steer" | "remember" | "learn";
}

export const UserBubble: React.FC<UserBubbleProps> = ({
	text,
	variant = "default",
}) => {
	return (
		<div
			className={`timeline-user-bubble ${variant !== "default" ? "is-command" : ""}`.trim()}
		>
			<div className="timeline-text">{text}</div>
		</div>
	);
};
