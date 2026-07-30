import React, { useEffect, useMemo, useRef } from "react";
import Style from "./index.module.css";

interface TextCountUpProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  duration?: number;
  delayStep?: number;
}

const DIGIT_PATTERN = /^\d$/;
const DIGITS = Array.from({ length: 10 }, (_, index) => index);
const TEXT_COUNT_UP_CLASS_NAME =
  "tw:inline-flex tw:items-baseline tw:whitespace-pre tw:[font-variant-numeric:tabular-nums]";
const CHAR_CLASS_NAME = [Style.Char, "tw:inline-block", "tw:opacity-0"].join(
  " ",
);
const CHAR_STATIC_CLASS_NAME = [Style.CharStatic, "tw:inline-block"].join(" ");
const DIGIT_CLASS_NAME =
  "tw:inline-block tw:h-[1em] tw:overflow-hidden tw:leading-none tw:align-baseline";
const DIGIT_LIST_CLASS_NAME = [Style.DigitList, "tw:flex", "tw:flex-col"].join(
  " ",
);
const DIGIT_LIST_STATIC_CLASS_NAME = [
  Style.DigitListStatic,
  "tw:flex",
  "tw:flex-col",
].join(" ");
const DIGIT_VALUE_CLASS_NAME = "tw:block tw:h-[1em] tw:leading-none";

export interface TextCountUpChar {
  key: string;
  char: string;
  fromDigit: number;
  toDigit: number;
  isDigit: boolean;
  changed: boolean;
}

export const getTextCountUpChars = (
  text: string,
  prevText?: string,
): TextCountUpChar[] => {
  const chars = Array.from(text);
  const prevChars = prevText ? Array.from(prevText) : [];
  const lengthOffset = prevChars.length - chars.length;

  return chars.map((char, index) => {
    const prevChar = prevChars[index + lengthOffset];
    const isDigit = DIGIT_PATTERN.test(char);
    const changed = prevChars?.length === 0 ? false : prevChar !== char;

    return {
      key: `${index}`,
      char,
      fromDigit:
        isDigit && DIGIT_PATTERN.test(prevChar || "") ? Number(prevChar) : 0,
      toDigit: isDigit ? Number(char) : 0,
      isDigit,
      changed,
    };
  });
};

type DigitStyle = React.CSSProperties & {
  "--digit-delay": string;
  "--digit-duration": string;
  "--from-digit": number;
  "--to-digit": number;
};

/**
 * 文本计数组件, 给数值添加动画进入效果
 * 1. 将字符串分割成字符数组
 * 2. 从结尾遍历字符数组, 每个字符添加动画进入效果
 * 3. 若字符为数字, 则添加动画进入效果为从0到该数字的计数滚动动画
 */
export const TextCountUp: React.FC<TextCountUpProps> = ({
  text,
  className = "",
  style,
  duration = 0.8,
  delayStep = 0.04,
}) => {
  const prevTextRef = useRef<string>();
  const frameRef = useRef(0);
  const chars = useMemo(
    () => getTextCountUpChars(text, prevTextRef.current),
    [text],
  );
  const lastIndex = chars.length - 1;
  const classes = [TEXT_COUNT_UP_CLASS_NAME, className]
    .filter(Boolean)
    .join(" ");
  const safeDuration = Math.max(duration, 0);
  const safeDelayStep = Math.max(delayStep, 0);

  useEffect(() => {
    frameRef.current += 1;
    prevTextRef.current = text;
  }, [text]);

  return (
    <span className={classes} style={style} aria-label={text}>
      {chars.map(
        ({ key: _key, char, fromDigit, isDigit, toDigit, changed }, index) => {
          const delay = (lastIndex - index) * safeDelayStep;
          // 变化字符的 key 包含 frame 计数器，强制 React 重建 DOM 以重播 CSS 动画
          const animKey = changed ? `${index}-${frameRef.current}` : `${index}`;

          if (!isDigit) {
            if (!changed) {
              return (
                <span
                  className={CHAR_STATIC_CLASS_NAME}
                  aria-hidden="true"
                  key={animKey}
                >
                  {char}
                </span>
              );
            }

            return (
              <span
                className={CHAR_CLASS_NAME}
                aria-hidden="true"
                key={animKey}
                style={{ animationDelay: `${delay}s` }}
              >
                {char}
              </span>
            );
          }

          if (!changed) {
            return (
              <span
                className={DIGIT_CLASS_NAME}
                aria-hidden="true"
                key={animKey}
                style={
                  {
                    "--from-digit": fromDigit,
                    "--to-digit": toDigit,
                  } as DigitStyle
                }
              >
                <span className={DIGIT_LIST_STATIC_CLASS_NAME}>
                  {DIGITS.map((digit) => (
                    <span className={DIGIT_VALUE_CLASS_NAME} key={digit}>
                      {digit}
                    </span>
                  ))}
                </span>
              </span>
            );
          }

          return (
            <span
              className={DIGIT_CLASS_NAME}
              aria-hidden="true"
              key={animKey}
              style={
                {
                  "--digit-delay": `${delay}s`,
                  "--digit-duration": `${safeDuration}s`,
                  "--from-digit": fromDigit,
                  "--to-digit": toDigit,
                } as DigitStyle
              }
            >
              <span className={DIGIT_LIST_CLASS_NAME}>
                {DIGITS.map((digit) => (
                  <span className={DIGIT_VALUE_CLASS_NAME} key={digit}>
                    {digit}
                  </span>
                ))}
              </span>
            </span>
          );
        },
      )}
    </span>
  );
};
