import React from "react";

type UiInputSize = "sm" | "md";

export interface UiInputProps
	extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
	inputSize?: UiInputSize;
}

export const UiInput = React.forwardRef<HTMLInputElement, UiInputProps>(
	({ inputSize = "md", className = "", ...rest }, ref) => {
		const classes = ["ui-input", `ui-input-${inputSize}`, className]
			.filter(Boolean)
			.join(" ");
		return <input ref={ref} className={classes} {...rest} />;
	},
);

UiInput.displayName = "UiInput";
