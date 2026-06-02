import React from "react";
import Style from "./index.module.css";

interface TextCountUpProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  duration?: number;
  delayStep?: number;
}

const DIGIT_PATTERN = /^\d$/;

const getDigitColumn = (digit: string) =>
  Array.from({ length: Number(digit) + 1 }, (_, index) => index);

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
  const chars = Array.from(text);
  const lastIndex = chars.length - 1;
  const classes = [Style.TextCountUp, className].filter(Boolean).join(" ");
  const safeDuration = Math.max(duration, 0);
  const safeDelayStep = Math.max(delayStep, 0);

  return (
    <span className={classes} style={style} aria-label={text}>
      {chars.map((char, index) => {
        const delay = (lastIndex - index) * safeDelayStep;

        if (!DIGIT_PATTERN.test(char)) {
          return (
            <span
              className={Style.Char}
              aria-hidden="true"
              key={`${char}-${index}`}
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
            key={`${char}-${index}`}
            style={
              {
                "--digit": Number(char),
                "--digit-delay": `${delay}s`,
                "--digit-duration": `${safeDuration}s`,
              } as React.CSSProperties
            }
          >
            <span className={Style.DigitList}>
              {getDigitColumn(char).map((digit) => (
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
