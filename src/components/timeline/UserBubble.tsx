import React from "react";

interface UserBubbleProps {
	text: string;
	variant?: "default" | "steer";
}

export const UserBubble: React.FC<UserBubbleProps> = ({
	text,
	variant = "default",
}) => {
	return (
		<div
			className={`timeline-user-bubble ${variant === "steer" ? "is-steer" : ""}`.trim()}
		>
			<div className="timeline-text">{text}</div>
		</div>
	);
};
