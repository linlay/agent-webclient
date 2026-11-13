import React from "react";

type UiButtonVariant = "primary" | "secondary" | "ghost";
type UiButtonSize = "mini" | "sm" | "md";
/**
 * 语义色调。`variant` 只决定用法（`primary` 实心、`secondary` 淡底、`ghost` 文字），
 * `color` 只决定颜色。缺省 `default` 沿用皮肤的中性配色，`accent` 取主题主色，
 * 危险操作用 `color="danger"`（实心危险按钮用 `variant="primary" color="danger"`）。
 */
export type UiButtonColor = "default" | "accent" | "success" | "warning" | "danger";

export interface UiButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: UiButtonVariant;
	color?: UiButtonColor;
	size?: UiButtonSize;
	iconOnly?: boolean;
	active?: boolean;
	loading?: boolean;
}

export const UiButton = React.forwardRef<HTMLButtonElement, UiButtonProps>(
	(
		{
			variant = "secondary",
			color = "default",
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
			// default 色调沿用皮肤的中性配色，因此不输出色调类。
			color === "default" ? "" : "ui-btn-tone",
			color === "default" ? "" : `ui-btn-color-${color}`,
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
