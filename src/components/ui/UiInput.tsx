import React from "react";

type UiInputSize = "sm" | "md";

export interface UiInputProps
	extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
	inputSize?: UiInputSize;
}

export const UiInput: React.FC<UiInputProps> = ({
	inputSize = "md",
	className = "",
	...rest
}) => {
	const classes = ["ui-input", `ui-input-${inputSize}`, className]
		.filter(Boolean)
		.join(" ");
	return <input className={classes} {...rest} />;
};
