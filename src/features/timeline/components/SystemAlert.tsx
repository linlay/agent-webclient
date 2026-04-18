import React from "react";

export const SystemAlert: React.FC<{ text: string }> = ({ text }) => {
	return <div className="system-alert">{text}</div>;
};
