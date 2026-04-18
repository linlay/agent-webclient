import React from "react";

type UiButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type UiButtonSize = "sm" | "md";

export interface UiButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: UiButtonVariant;
	size?: UiButtonSize;
	iconOnly?: boolean;
	active?: boolean;
	loading?: boolean;
}

export const UiButton = React.forwardRef<HTMLButtonElement, UiButtonProps>(
	(
		{
			variant = "secondary",
			size = "md",
			iconOnly = false,
			active = false,
			loading = false,
			className = "",
			type = "button",
			children,
			disabled,
			...rest
		},
		ref,
	) => {
		const classes = [
			"ui-btn",
			`ui-btn-${variant}`,
			`ui-btn-${size}`,
			iconOnly ? "is-icon-only" : "",
			active ? "is-active" : "",
			loading ? "is-loading" : "",
			className,
		]
			.filter(Boolean)
			.join(" ");

		return (
			<button
				ref={ref}
				type={type}
				className={classes}
				disabled={disabled || loading}
				{...rest}
			>
				<span className="ui-btn-label">{children}</span>
			</button>
		);
	},
);

UiButton.displayName = "UiButton";
