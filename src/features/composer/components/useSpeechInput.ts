import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/shared/i18n";

export type SpeechRecognitionLike = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	onstart: (() => void) | null;
	onend: (() => void) | null;
	onerror: ((event: { error?: string }) => void) | null;
	onresult:
		| ((event: {
				resultIndex: number;
				results: ArrayLike<{
					isFinal: boolean;
					0: { transcript: string };
				}>;
		  }) => void)
		| null;
	start: () => void;
	stop: () => void;
};

type SpeechConstructor = new () => SpeechRecognitionLike;

function getSpeechConstructor(): SpeechConstructor | undefined {
	return (
		(
			window as Window & {
				SpeechRecognition?: SpeechConstructor;
				webkitSpeechRecognition?: SpeechConstructor;
			}
		).SpeechRecognition ||
		(
			window as Window & {
				webkitSpeechRecognition?: SpeechConstructor;
			}
		).webkitSpeechRecognition
	);
}

export function useSpeechInput(input: {
	inputValue: string;
	setInputValue: (value: string) => void;
	setSlashDismissed: (dismissed: boolean) => void;
	updateMentionSuggestions: (value: string) => void;
}) {
	const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
	const speechBaseValueRef = useRef("");
	const speechFinalBufferRef = useRef("");
	const speechListeningRef = useRef(false);
	const [speechSupported, setSpeechSupported] = useState(false);
	const [speechListening, setSpeechListening] = useState(false);
	const [speechState, setSpeechState] = useState<
		"ready" | "unsupported" | "listening" | "error"
	>("ready");
	const [speechStatus, setSpeechStatus] = useState(t("composer.speech.ready"));

	const mergeSpeechText = useCallback((base: string, append: string) => {
		if (!append) return base;
		return `${base}${append}`;
	}, []);

	useEffect(() => {
		const supported = Boolean(getSpeechConstructor());
		setSpeechSupported(supported);
		setSpeechState(supported ? "ready" : "unsupported");
		setSpeechStatus(
			supported
				? t("composer.speech.ready")
				: t("composer.speech.unsupported"),
		);
	}, []);

	const stopSpeechInput = useCallback(() => {
		speechListeningRef.current = false;
		setSpeechListening(false);
		setSpeechState("ready");
		setSpeechStatus(t("composer.speech.ready"));
		const recognition = speechRecognitionRef.current;
		if (!recognition) return;
		try {
			recognition.stop();
		} catch {
			/* no-op */
		}
	}, []);

	const startSpeechInput = useCallback(() => {
		const ctor = getSpeechConstructor();

		if (!ctor) {
			setSpeechState("unsupported");
			setSpeechStatus(t("composer.speech.unsupported"));
			return;
		}

		if (!speechRecognitionRef.current) {
			const recognition = new ctor();
			recognition.lang = "zh-CN";
			recognition.continuous = true;
			recognition.interimResults = true;
			recognition.onstart = () => {
				speechListeningRef.current = true;
				setSpeechListening(true);
				setSpeechState("listening");
				setSpeechStatus(t("composer.speech.listening"));
			};
			recognition.onend = () => {
				speechListeningRef.current = false;
				setSpeechListening(false);
				setSpeechState("ready");
				setSpeechStatus(t("composer.speech.ready"));
			};
			recognition.onerror = (event) => {
				const msg = String(event?.error || "recognition failed");
				speechListeningRef.current = false;
				setSpeechListening(false);
				setSpeechState("error");
				setSpeechStatus(t("composer.speech.error", { detail: msg }));
			};
			recognition.onresult = (event) => {
				let finalDelta = "";
				let interimDelta = "";
				for (let i = event.resultIndex; i < event.results.length; i += 1) {
					const chunk = event.results[i]?.[0]?.transcript || "";
					if (!chunk) continue;
					if (event.results[i].isFinal) {
						finalDelta += chunk;
					} else {
						interimDelta += chunk;
					}
				}
				if (finalDelta) {
					speechFinalBufferRef.current += finalDelta;
				}
				const next = mergeSpeechText(
					speechBaseValueRef.current,
					`${speechFinalBufferRef.current}${interimDelta}`,
				);
				input.setInputValue(next);
				input.setSlashDismissed(false);
				input.updateMentionSuggestions(next);
			};
			speechRecognitionRef.current = recognition;
		}

		speechBaseValueRef.current = input.inputValue;
		speechFinalBufferRef.current = "";
		try {
			speechRecognitionRef.current.start();
		} catch {
			setSpeechState("error");
			setSpeechStatus(t("composer.speech.retry"));
		}
	}, [input, mergeSpeechText]);

	const toggleSpeechInput = useCallback(() => {
		if (speechListeningRef.current) {
			stopSpeechInput();
		} else {
			startSpeechInput();
		}
	}, [startSpeechInput, stopSpeechInput]);

	useEffect(() => {
		return () => {
			const recognition = speechRecognitionRef.current;
			if (!recognition) return;
			try {
				recognition.stop();
			} catch {
				/* no-op */
			}
		};
	}, []);

	return {
		speechSupported,
		speechListening,
		speechState,
		speechStatus,
		toggleSpeechInput,
		stopSpeechInput,
	};
}
