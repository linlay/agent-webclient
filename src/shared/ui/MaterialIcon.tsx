import React from "react";

interface MaterialIconProps extends React.HTMLAttributes<HTMLSpanElement> {
	name: string;
	className?: string;
}

export const MaterialIcon: React.FC<MaterialIconProps> = ({
	name,
	className = "",
	...props
}) => {
	return (
		<span className={`material-symbols-rounded ${className}`.trim()} {...props}>
			{name}
		</span>
	);
};
