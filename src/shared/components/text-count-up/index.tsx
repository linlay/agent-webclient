import React, { useEffect, useMemo, useRef } from "react";
import Style from "./index.module.css";
import { uniqueId } from "lodash";

interface TextCountUpProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  duration?: number;
  delayStep?: number;
}

const DIGIT_PATTERN = /^\d$/;
const DIGITS = Array.from({ length: 10 }, (_, index) => index);

export interface TextCountUpChar {
  key: string;
  char: string;
  fromDigit: number;
  toDigit: number;
  isDigit: boolean;
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

    return {
      key: uniqueId('char-'),
      char,
      fromDigit:
        isDigit && DIGIT_PATTERN.test(prevChar || "") ? Number(prevChar) : 0,
      toDigit: isDigit ? Number(char) : 0,
      isDigit,
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
  const chars = useMemo(
    () => getTextCountUpChars(text, prevTextRef.current),
    [text],
  );
  const lastIndex = chars.length - 1;
  const classes = [Style.TextCountUp, className].filter(Boolean).join(" ");
  const safeDuration = Math.max(duration, 0);
  const safeDelayStep = Math.max(delayStep, 0);

  useEffect(() => {
    prevTextRef.current = text;
  }, [text]);

  return (
    <span className={classes} style={style} aria-label={text}>
      {chars.map(({ key, char, fromDigit, isDigit, toDigit }, index) => {
        const delay = (lastIndex - index) * safeDelayStep;

        if (!isDigit) {
          return (
            <span
              className={Style.Char}
              aria-hidden="true"
              key={key}
              style={{ animationDelay: `${delay}s` }}
            >
              {char}
            </span>
          );
        }

        return (
          <span
            className={Style.Digit}
            aria-hidden="true"
            key={key}
            style={
              {
                "--digit-delay": `${delay}s`,
                "--digit-duration": `${safeDuration}s`,
                "--from-digit": fromDigit,
                "--to-digit": toDigit,
              } as DigitStyle
            }
          >
            <span className={Style.DigitList}>
              {DIGITS.map((digit) => (
                <span className={Style.DigitValue} key={digit}>
                  {digit}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
};
