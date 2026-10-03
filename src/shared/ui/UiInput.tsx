import { bindCssModuleClasses } from "@/shared/utils/cssModuleClasses";
import sharedPresentation from "@/shared/ui/Presentation.module.css";
import React from "react";
const presentationClasses = bindCssModuleClasses({ ...sharedPresentation });


type UiInputSize = "sm" | "md";

export interface UiInputProps
	extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
	inputSize?: UiInputSize;
}

export const UiInput = React.forwardRef<HTMLInputElement, UiInputProps>(
	({ inputSize = "md", className = "", ...rest }, ref) => {
		const classes = [presentationClasses("ui-input"), `ui-input-${inputSize}`, className]
			.filter(Boolean)
			.join(" ");
		return <input ref={ref} className={classes} {...rest} />;
	},
);

UiInput.displayName = "UiInput";
