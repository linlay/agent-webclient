import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useReducer,
	useRef,
} from "react";
import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";
import { appReducer } from "@/app/state/reducer";
import { createInitialState } from "@/app/state/state";
import type { LiveQuerySession } from "@/features/chats/lib/conversationSession";
import { getAppAccessToken, refreshAppAccessToken } from "@/shared/api/appAuth";
import { getSchedules, setAccessToken } from "@/shared/api/apiClient";
import { isAppMode } from "@/shared/utils/routing";
import {
	applyThemeModeToDocument,
	writeStoredThemeMode,
} from "@/shared/styles/theme";
import { writeStoredTransportMode } from "@/features/transport/lib/transportMode";

export interface AppContextValue {
	state: AppState;
	dispatch: React.Dispatch<AppAction>;
	stateRef: React.MutableRefObject<AppState>;
	querySessionsRef: React.MutableRefObject<Map<string, LiveQuerySession>>;
	chatQuerySessionIndexRef: React.MutableRefObject<Map<string, string>>;
	activeQuerySessionRequestIdRef: React.MutableRefObject<string>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [state, baseDispatch] = useReducer(
		appReducer,
		undefined,
		createInitialState,
	);
	const stateRef = useRef(state);
	const querySessionsRef = useRef(new Map<string, LiveQuerySession>());
	const chatQuerySessionIndexRef = useRef(new Map<string, string>());
	const activeQuerySessionRequestIdRef = useRef("");
	const initialScheduleLoadStartedRef = useRef(false);
	stateRef.current = state;

	const dispatch = useCallback<React.Dispatch<AppAction>>((action) => {
		if (
			action.type === "SHOW_COMMAND_STATUS_OVERLAY" ||
			action.type === "HIDE_COMMAND_STATUS_OVERLAY" ||
			action.type === "RESET_CONVERSATION" ||
			action.type === "RESET_ACTIVE_CONVERSATION"
		) {
			const overlayTimer = stateRef.current.commandStatusOverlay.timer;
			if (overlayTimer) {
				clearTimeout(overlayTimer);
			}
		}
		if (
			action.type === "RESET_CONVERSATION" ||
			action.type === "RESET_ACTIVE_CONVERSATION"
		) {
			const artifactTimer = stateRef.current.artifactAutoCollapseTimer;
			if (artifactTimer) {
				clearTimeout(artifactTimer);
			}
			const planTimer = stateRef.current.planAutoCollapseTimer;
			if (planTimer) {
				clearTimeout(planTimer);
			}
			for (const timer of stateRef.current.reasoningCollapseTimers.values()) {
				clearTimeout(timer);
			}
		}
		baseDispatch(action);
	}, []);

	const value = useMemo<AppContextValue>(
		() => ({
			state,
			dispatch,
			stateRef,
			querySessionsRef,
			chatQuerySessionIndexRef,
			activeQuerySessionRequestIdRef,
		}),
		[state, dispatch],
	);

	useEffect(() => {
		applyThemeModeToDocument(state.themeMode);
		writeStoredThemeMode(state.themeMode);
	}, [state.themeMode]);

	useEffect(() => {
		writeStoredTransportMode(state.transportMode);
	}, [state.transportMode]);

	useEffect(() => {
		if (!isAppMode()) {
			return;
		}

		let cancelled = false;
		const currentToken = getAppAccessToken() || "";
		if (currentToken) {
			setAccessToken(currentToken);
			if (currentToken !== stateRef.current.accessToken) {
				dispatch({ type: "SET_ACCESS_TOKEN", token: currentToken });
			}
			return;
		}

		refreshAppAccessToken("missing")
			.then((token) => {
				if (cancelled || !token) {
					return;
				}
				setAccessToken(token);
				if (token !== stateRef.current.accessToken) {
					dispatch({ type: "SET_ACCESS_TOKEN", token });
				}
			})
			.catch(() => undefined);

		return () => {
			cancelled = true;
		};
	}, [dispatch]);

	useEffect(() => {
		if (initialScheduleLoadStartedRef.current) {
			return;
		}
		if (isAppMode() && !String(state.accessToken || "").trim()) {
			return;
		}

		initialScheduleLoadStartedRef.current = true;
		setAccessToken(stateRef.current.accessToken);
		getSchedules()
			.then((response) => {
				dispatch({
					type: "SET_SCHEDULES",
					schedules: response.data.items || [],
				});
			})
			.catch((error) => {
				dispatch({
					type: "APPEND_DEBUG",
					line: `[loadSchedules error] ${(error as Error).message}`,
				});
			});
	}, [dispatch, state.accessToken]);

	return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useAppContext(): AppContextValue {
	const ctx = useContext(AppContext);
	if (!ctx) {
		throw new Error("useAppContext must be used within an AppProvider");
	}
	return ctx;
}

export function useAppState(): AppState {
	return useAppContext().state;
}

export function useAppDispatch(): React.Dispatch<AppAction> {
	return useAppContext().dispatch;
}
