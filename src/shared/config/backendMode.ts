import { readRuntimeConfigValue } from "@/shared/config/runtimeConfig";

export type BackendMode = "platform" | "gateway";

export function getBackendMode(): BackendMode {
	const value = String(readRuntimeConfigValue("BACKEND_MODE") || "platform")
		.trim()
		.toLowerCase();
	if (value === "platform" || value === "gateway") {
		return value;
	}
	throw new Error(
		`Invalid BACKEND_MODE "${value}". Expected "platform" or "gateway".`,
	);
}

export function isGatewayBackendMode(): boolean {
	return getBackendMode() === "gateway";
}

export function isPlatformBackendMode(): boolean {
	return getBackendMode() === "platform";
}
