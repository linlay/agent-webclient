import { useMemo, useRef, useEffect } from "react";
import { Flex } from "antd";
import Style from "./index.module.css";

interface LogoLoadingProps {
  size?: number;
  text?: string;
}

const STEP = 0.3;

export const LogoLoading: React.FC<LogoLoadingProps> = ({
  size = 20,
  text,
}) => {
  const charsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const chars = useMemo(() => text?.split("") || [], [text]);
  const totalChars = chars.length;
  const duration = totalChars * STEP;
  const jumpEnd = 1 / totalChars;

  useEffect(() => {
    const anims: Animation[] = [];
    charsRef.current.forEach((el, i) => {
      if (!el) return;
      const anim = el.animate(
        [
          { transform: "translateY(0)" },
          { transform: "translateY(-0.5em)", offset: jumpEnd / 2 },
          { transform: "translateY(0)", offset: jumpEnd },
          { transform: "translateY(0)", offset: 1 },
        ],
        {
          duration: duration * 1000,
          delay: i * STEP * 1000,
          iterations: Infinity,
          easing: "ease-in-out",
        },
      );
      anims.push(anim);
    });
    return () => anims.forEach((a) => a.cancel());
  }, [duration, jumpEnd]);

  return (
    <Flex
      gap={2}
      className={Style.Root}
      style={{ fontSize: size }}
      align="center"
    >
      <div className={Style.Loading} style={{ width: size, height: size }} />
      {chars.map((char, i) => (
        <span
          key={i}
          ref={(el) => {
            charsRef.current[i] = el;
          }}
        >
          {char}
        </span>
      ))}
    </Flex>
  );
};
