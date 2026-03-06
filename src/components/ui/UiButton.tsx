import React from "react";

type UiButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type UiButtonSize = "sm" | "md";

export interface UiButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: UiButtonVariant;
	size?: UiButtonSize;
	iconOnly?: boolean;
	active?: boolean;
	loading?: boolean;
}

export const UiButton: React.FC<UiButtonProps> = ({
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
}) => {
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
		<button type={type} className={classes} disabled={disabled || loading} {...rest}>
			{loading ? <span className="ui-btn-spinner" aria-hidden="true" /> : null}
			<span className="ui-btn-label">{children}</span>
		</button>
	);
};
