import React from "react";

export interface UiListItemProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	selected?: boolean;
	dense?: boolean;
}

export const UiListItem: React.FC<UiListItemProps> = ({
	selected = false,
	dense = false,
	className = "",
	type = "button",
	children,
	...rest
}) => {
	const classes = [
		"ui-list-item",
		selected ? "is-selected" : "",
		dense ? "is-dense" : "",
		className,
	]
		.filter(Boolean)
		.join(" ");

	return (
		<button type={type} className={classes} {...rest}>
			{children}
		</button>
	);
};

