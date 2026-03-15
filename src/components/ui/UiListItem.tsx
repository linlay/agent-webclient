import React from "react";

export interface UiListItemProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	selected?: boolean;
	dense?: boolean;
}

export const UiListItem = React.forwardRef<HTMLButtonElement, UiListItemProps>(
	(
		{
			selected = false,
			dense = false,
			className = "",
			type = "button",
			children,
			...rest
		},
		ref,
	) => {
		const classes = [
			"ui-list-item",
			selected ? "is-selected" : "",
			dense ? "is-dense" : "",
			className,
		]
			.filter(Boolean)
			.join(" ");

		return (
			<button ref={ref} type={type} className={classes} {...rest}>
				{children}
			</button>
		);
	},
);

UiListItem.displayName = "UiListItem";
