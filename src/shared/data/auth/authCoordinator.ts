import { isGatewayBackendMode } from "@/shared/config/backendMode";
import { getGatewaySession } from "@/shared/data/auth/gatewaySession";

export type AuthFailureSource = "json" | "sse" | "ws" | "download";

let navigationStarted = false;
let navigationOverride: ((url: string) => void) | null = null;

function currentOrigin(): string {
	return typeof window !== "undefined" && window.location?.origin
		? window.location.origin
		: "http://localhost";
}

export function sanitizeRelativeReturnTo(value: string, origin = currentOrigin()): string {
	const candidate = String(value || "").trim();
	if (
		!candidate.startsWith("/") ||
		candidate.startsWith("//") ||
		candidate.startsWith("/\\") ||
		candidate.includes("\u0000")
	) {
		return "/";
	}
	try {
		const parsed = new URL(candidate, origin);
		if (parsed.origin !== new URL(origin).origin) {
			return "/";
		}
		return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
	} catch {
		return "/";
	}
}

export function currentRelativeRoute(): string {
	if (typeof window === "undefined") return "/";
	const route = sanitizeRelativeReturnTo(
		`${window.location.pathname}${window.location.search}${window.location.hash}`,
		window.location.origin,
	);
	return route.startsWith("/login") ? "/" : route;
}

export function buildGatewayLoginUrl(
	loginUrl: string,
	returnTo = currentRelativeRoute(),
): string {
	const origin = currentOrigin();
	const fallback = "/auth/login";
	let parsed: URL;
	try {
		parsed = new URL(loginUrl || fallback, origin);
		if (parsed.origin !== new URL(origin).origin) {
			parsed = new URL(fallback, origin);
		}
	} catch {
		parsed = new URL(fallback, origin);
	}
	parsed.searchParams.set("return_to", sanitizeRelativeReturnTo(returnTo, origin));
	return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function isWsAuthenticationRequired(input: {
	code?: unknown;
	status?: unknown;
	type?: unknown;
}): boolean {
	return (
		Number(input.code) === 401 ||
		Number(input.status) === 401 ||
		String(input.type || "").trim().toLowerCase() === "auth.required"
	);
}

export function handleFinalUnauthorized(source: AuthFailureSource): boolean {
	if (!isGatewayBackendMode() || navigationStarted) {
		return false;
	}
	navigationStarted = true;
	const session = getGatewaySession();
	const destination = buildGatewayLoginUrl(
		session?.auth.loginUrl || "/auth/login",
	);
	if (typeof window !== "undefined" && typeof CustomEvent === "function") {
		window.dispatchEvent(
			new CustomEvent("agent:auth-required", {
				detail: { source, returnTo: currentRelativeRoute() },
			}),
		);
	}
	const navigate =
		navigationOverride ||
		((url: string) => {
			window.location.assign(url);
		});
	navigate(destination);
	return true;
}

export function resetAuthCoordinatorForTests(): void {
	navigationStarted = false;
	navigationOverride = null;
}

export function setAuthCoordinatorNavigationForTests(
	navigate: ((url: string) => void) | null,
): void {
	navigationOverride = navigate;
}
