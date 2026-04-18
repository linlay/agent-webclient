import React from "react";

export const UiSection: React.FC<
	React.HTMLAttributes<HTMLElement>
> = ({ className = "", children, ...rest }) => {
	return (
		<section className={["ui-section", className].join(" ").trim()} {...rest}>
			{children}
		</section>
	);
};

export const UiSectionHead: React.FC<
	React.HTMLAttributes<HTMLDivElement>
> = ({ className = "", children, ...rest }) => {
	return (
		<div
			className={["ui-section-head", className].join(" ").trim()}
			{...rest}
		>
			{children}
		</div>
	);
};

export const UiSectionBody: React.FC<
	React.HTMLAttributes<HTMLDivElement>
> = ({ className = "", children, ...rest }) => {
	return (
		<div
			className={["ui-section-body", className].join(" ").trim()}
			{...rest}
		>
			{children}
		</div>
	);
};

