import { useCallback, useEffect, useRef, useState } from "react";

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
	const [speechStatus, setSpeechStatus] = useState("点击开始听写");

	const mergeSpeechText = useCallback((base: string, append: string) => {
		if (!append) return base;
		return `${base}${append}`;
	}, []);

	useEffect(() => {
		setSpeechSupported(Boolean(getSpeechConstructor()));
	}, []);

	const stopSpeechInput = useCallback(() => {
		speechListeningRef.current = false;
		setSpeechListening(false);
		setSpeechStatus("点击开始听写");
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
			setSpeechStatus("当前浏览器不支持语音输入");
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
				setSpeechStatus("正在听写...");
			};
			recognition.onend = () => {
				speechListeningRef.current = false;
				setSpeechListening(false);
				setSpeechStatus("点击开始听写");
			};
			recognition.onerror = (event) => {
				const msg = String(event?.error || "识别失败");
				speechListeningRef.current = false;
				setSpeechListening(false);
				setSpeechStatus(`语音识别错误: ${msg}`);
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
			setSpeechStatus("语音识别未启动，请重试");
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
		speechStatus,
		toggleSpeechInput,
		stopSpeechInput,
	};
}
