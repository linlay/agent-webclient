import React from "react";

type UiTagTone = "default" | "accent" | "muted" | "danger";

export interface UiTagProps extends React.HTMLAttributes<HTMLSpanElement> {
	tone?: UiTagTone;
}

export const UiTag: React.FC<UiTagProps> = ({
	tone = "default",
	className = "",
	children,
	...rest
}) => {
	const classes = ["ui-tag", `ui-tag-${tone}`, className]
		.filter(Boolean)
		.join(" ");
	return (
		<span className={classes} {...rest}>
			{children}
		</span>
	);
};

