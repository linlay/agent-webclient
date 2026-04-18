import React from "react";

/**
 * ActionModal — shown by the action runtime (e.g. show_modal action).
 * Controlled imperatively via DOM for compatibility with actionRuntime.
 */
export const ActionModal: React.FC = () => {
	return (
		<div
			className="modal hidden"
			id="action-modal"
			onClick={(e) => {
				if (e.target === e.currentTarget) {
					(e.target as HTMLElement).classList.add("hidden");
				}
			}}
		>
			<div className="modal-card">
				<h3 id="action-modal-title">通知</h3>
				<p id="action-modal-content" />
				<button
					id="action-modal-close"
					style={{ marginTop: "12px", width: "100%" }}
				>
					关闭
				</button>
			</div>
		</div>
	);
};
