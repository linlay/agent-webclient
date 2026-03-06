import React from "react";

type UiCardTone = "default" | "subtle";

export interface UiCardProps extends React.HTMLAttributes<HTMLDivElement> {
	tone?: UiCardTone;
}

export const UiCard: React.FC<UiCardProps> = ({
	tone = "default",
	className = "",
	children,
	...rest
}) => {
	const classes = ["ui-card", `ui-card-${tone}`, className]
		.filter(Boolean)
		.join(" ");
	return (
		<div className={classes} {...rest}>
			{children}
		</div>
	);
};

