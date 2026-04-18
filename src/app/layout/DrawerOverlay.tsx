import React from "react";
import { useAppDispatch } from "@/app/state/AppContext";

export const DrawerOverlay: React.FC = () => {
	const dispatch = useAppDispatch();

	return (
		<div
			className="drawer-overlay"
			id="drawer-overlay"
			onClick={() => {
				dispatch({ type: "SET_LEFT_DRAWER_OPEN", open: false });
				dispatch({ type: "SET_RIGHT_DRAWER_OPEN", open: false });
				dispatch({ type: "CLOSE_ATTACHMENT_PREVIEW" });
			}}
		/>
	);
};
