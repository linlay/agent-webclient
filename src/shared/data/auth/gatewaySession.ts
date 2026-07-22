import { isGatewayBackendMode } from "@/shared/config/backendMode";

export type GatewayLoginMode = "local" | "sso";

export interface GatewaySessionUser {
	subject: string;
	name: string;
	roles: string[];
	groups: string[];
}

export interface GatewaySession {
	authenticated: boolean;
	user: GatewaySessionUser | null;
	tenant: {
		displayName: string;
		logoUrl?: string;
	};
	csrfToken: string;
	auth: {
		mode: GatewayLoginMode;
		loginUrl: string;
		logoutUrl: string;
	};
	features: Record<string, boolean>;
}

export class GatewaySessionError extends Error {
	status: number | null;
	code: string;

	constructor(message: string, status: number | null = null, code = "") {
		super(message);
		this.name = "GatewaySessionError";
		this.status = status;
		this.code = code;
	}
}

let currentSession: GatewaySession | null = null;
let bootstrapPromise: Promise<GatewaySession> | null = null;

function objectValue(value: unknown): Record<string, unknown> {
	return value != null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter(Boolean)
		: [];
}

function normalizeLoginMode(value: unknown): GatewayLoginMode {
	return String(value || "").trim().toLowerCase() === "local"
		? "local"
		: "sso";
}

export function parseGatewaySession(input: unknown): GatewaySession {
	const envelope = objectValue(input);
	const payload = objectValue("data" in envelope ? envelope.data : envelope);
	const tenant = objectValue(payload.tenant);
	const auth = objectValue(payload.auth);
	const user = objectValue(payload.user);
	const features = objectValue(payload.features);
	const authenticated = payload.authenticated === true;
	const loginUrl = String(auth.loginUrl || payload.loginUrl || "/auth/login").trim();
	const logoutUrl = String(auth.logoutUrl || payload.logoutUrl || "/auth/logout").trim();
	const normalizedFeatures: Record<string, boolean> = {};
	for (const [key, value] of Object.entries(features)) {
		if (typeof value === "boolean") {
			normalizedFeatures[key] = value;
		}
	}

	return {
		authenticated,
		user: authenticated
			? {
					subject: String(user.subject || "").trim(),
					name: String(user.name || "").trim(),
					roles: stringList(user.roles),
					groups: stringList(user.groups),
				}
			: null,
		tenant: {
			displayName: String(tenant.displayName || tenant.name || "").trim(),
			...(typeof tenant.logoUrl === "string" && tenant.logoUrl.trim()
				? { logoUrl: tenant.logoUrl.trim() }
				: {}),
		},
		csrfToken: String(payload.csrfToken || "").trim(),
		auth: {
			mode: normalizeLoginMode(auth.mode),
			loginUrl: loginUrl || "/auth/login",
			logoutUrl: logoutUrl || "/auth/logout",
		},
		features: normalizedFeatures,
	};
}

function errorDetails(input: unknown): { code: string; message: string } {
	const envelope = objectValue(input);
	const data = objectValue(envelope.data);
	const error = objectValue(data.error || envelope.error);
	return {
		code: String(error.code || envelope.code || "").trim(),
		message: String(error.message || envelope.msg || "").trim(),
	};
}

async function readResponse(response: Response): Promise<unknown> {
	const text = await response.text();
	if (!text) return {};
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new GatewaySessionError(
			`Gateway returned invalid JSON (HTTP ${response.status})`,
			response.status,
		);
	}
}

async function requestSession(): Promise<GatewaySession> {
	const response = await fetch("/api/gateway/session", {
		method: "GET",
		credentials: "same-origin",
		headers: { Accept: "application/json" },
	});
	const body = await readResponse(response);
	if (!response.ok) {
		const details = errorDetails(body);
		throw new GatewaySessionError(
			details.message || `Gateway session request failed (HTTP ${response.status})`,
			response.status,
			details.code,
		);
	}
	return parseGatewaySession(body);
}

function publishSession(session: GatewaySession): GatewaySession {
	const previousIdentity = currentSession?.authenticated
		? currentSession.user?.subject || "authenticated"
		: currentSession
			? "anonymous"
			: "";
	const nextIdentity = session.authenticated
		? session.user?.subject || "authenticated"
		: "anonymous";
	currentSession = session;
	if (
		previousIdentity &&
		previousIdentity !== nextIdentity &&
		typeof window !== "undefined"
	) {
		window.dispatchEvent(
			new CustomEvent("agent:gateway-identity-transition", {
				detail: { previousIdentity, nextIdentity },
			}),
		);
	}
	return session;
}

export function getGatewaySession(): GatewaySession | null {
	return currentSession;
}

export async function initializeGatewaySession(): Promise<GatewaySession | null> {
	if (!isGatewayBackendMode()) {
		return null;
	}
	if (currentSession) {
		return currentSession;
	}
	if (!bootstrapPromise) {
		bootstrapPromise = requestSession()
			.then(publishSession)
			.finally(() => {
				bootstrapPromise = null;
			});
	}
	return bootstrapPromise;
}

export async function refreshGatewaySession(): Promise<GatewaySession> {
	if (!isGatewayBackendMode()) {
		throw new GatewaySessionError("Gateway session is unavailable in platform mode");
	}
	return publishSession(await requestSession());
}

export async function loginWithGatewayCredentials(input: {
	username: string;
	password: string;
}): Promise<GatewaySession> {
	const session = currentSession || (await initializeGatewaySession());
	if (!session) {
		throw new GatewaySessionError("Gateway session is unavailable");
	}
	const response = await fetch("/api/gateway/login", {
		method: "POST",
		credentials: "same-origin",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
			"X-CSRF-Token": session.csrfToken,
		},
		body: JSON.stringify(input),
	});
	const body = await readResponse(response);
	if (!response.ok) {
		const details = errorDetails(body);
		throw new GatewaySessionError(
			details.message || "Invalid username or password",
			response.status,
			details.code,
		);
	}
	return refreshGatewaySession();
}

export async function logoutGatewaySession(): Promise<GatewaySession> {
	const session = currentSession || (await initializeGatewaySession());
	if (!session) {
		throw new GatewaySessionError("Gateway session is unavailable");
	}
	const response = await fetch(session.auth.logoutUrl, {
		method: "POST",
		credentials: "same-origin",
		headers: {
			Accept: "application/json",
			"X-CSRF-Token": session.csrfToken,
		},
	});
	const body = await readResponse(response);
	if (!response.ok) {
		const details = errorDetails(body);
		throw new GatewaySessionError(
			details.message || `Gateway logout failed (HTTP ${response.status})`,
			response.status,
			details.code,
		);
	}
	return refreshGatewaySession();
}

export function resetGatewaySessionForTests(): void {
	currentSession = null;
	bootstrapPromise = null;
}
