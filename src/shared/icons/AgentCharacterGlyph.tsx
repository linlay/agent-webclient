import React, { useId } from "react";
import { AgentDefaultPose } from "./AgentDefaultPose";
import type { RunActivityExpression, RunActivityVariant } from "./agentCharacterState";
import styles from "./AgentCharacter.module.css";

function Face({ expression }: { expression: RunActivityExpression }) {
  switch (expression) {
    case "curious": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="80" y="72" width="13" height="28" rx="6.5" fill="currentColor" /><rect x="114" y="72" width="13" height="28" rx="6.5" fill="currentColor" /></g><circle cx="103" cy="124" r="5.5" fill="currentColor"/></g></>;
    case "focus": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="74" y="82" width="13" height="24" rx="6.5" fill="currentColor" transform="rotate(-10 80.5 94)"/><rect x="113" y="82" width="13" height="24" rx="6.5" fill="currentColor" transform="rotate(10 119.5 94)"/></g><rect x="93" y="122" width="14" height="7" rx="3.5" fill="currentColor" /></g></>;
    case "ponder": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="73" y="77" width="13" height="30" rx="6.5" fill="currentColor" /><rect x="114" y="84" width="13" height="20" rx="6.5" fill="currentColor" /></g><path className={styles["stroke"]} d="M89 123 Q95 131 100 121 Q105 131 111 123" strokeWidth={7}/></g></>;
    case "scan": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="70" y="83" width="13" height="24" rx="6.5" fill="currentColor" /><rect x="110" y="83" width="13" height="24" rx="6.5" fill="currentColor" /></g><rect x="95" y="122" width="12" height="7" rx="3.5" fill="currentColor" /></g></>;
    case "wink": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="72" y="73" width="13" height="28" rx="6.5" fill="currentColor" /><path className={styles["stroke"]} d="M109 96 Q121 77 133 96" strokeWidth={11}/></g><circle cx="103" cy="125" r="5.5" className={styles["stroke"]} strokeWidth={6}/></g></>;
    case "surprise": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="74" y="81" width="13" height="26" rx="6.5" fill="currentColor" className={styles["surprise-eye"]}/><rect x="113" y="81" width="13" height="26" rx="6.5" fill="currentColor" className={styles["surprise-eye"]}/></g><rect x="95" y="122" width="10" height="9" rx="4.5" fill="currentColor" className={styles["surprise-mouth"]}/></g></>;
    case "round": return <><g className={styles["features"]}><g className={styles["eyes"]}><circle className={styles["round-eye"]} cx="78" cy="94" r="6" fill="currentColor"/><circle className={styles["round-eye"]} cx="122" cy="94" r="6" fill="currentColor"/></g><circle cx="100" cy="124" r="5" fill="currentColor"/></g></>;
    case "side": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="61" y="86" width="28" height="12" rx="6" fill="currentColor" /><rect x="103" y="86" width="28" height="12" rx="6" fill="currentColor" /></g><rect x="98" y="120" width="14" height="8" rx="4" fill="currentColor" /></g></>;
    case "sleepy": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="74" y="85" width="12" height="23" rx="6" fill="currentColor" /><rect x="114" y="85" width="12" height="23" rx="6" fill="currentColor" /></g><ellipse className={styles["sleepy-mouth"]} cx="100" cy="124" rx="4" ry="4" fill="currentColor"/></g></>;
    case "talk": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="73" y="75" width="13" height="33" rx="6.5" fill="currentColor" /><rect x="114" y="75" width="13" height="33" rx="6.5" fill="currentColor" /></g><rect x="94" y="119" width="13" height="15" rx="6.5" fill="currentColor" /></g></>;
    case "proud": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="70" y="86" width="25" height="10" rx="5" fill="currentColor" transform="rotate(-12 82 91)"/><path className={styles["stroke"]} d="M112 94 Q121 81 131 89" strokeWidth={9}/></g><path className={styles["stroke"]} d="M96 124 Q112 131 120 115" strokeWidth={8}/></g></>;
    case "reading": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="72" y="91" width="14" height="18" rx="7" fill="currentColor" /><rect x="114" y="91" width="14" height="18" rx="7" fill="currentColor" /></g><rect x="95" y="125" width="10" height="6" rx="3" fill="currentColor" /></g></>;
    case "compute": return <><g className={styles["features"]}><g className={styles["eyes"]}><circle cx="78" cy="93" r="8" fill="currentColor"/><circle cx="122" cy="93" r="8" fill="currentColor"/></g><path className={styles["stroke"]} d="M93 125 Q100 118 107 125" strokeWidth={7}/></g></>;
    case "debug": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="72" y="81" width="14" height="27" rx="7" fill="currentColor" /><path className={styles["stroke"]} d="M111 94 L132 90" strokeWidth={10}/></g><circle cx="105" cy="125" r="5" fill="currentColor"/></g></>;
    case "verify": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="73" y="83" width="14" height="22" rx="7" fill="currentColor" /><rect x="113" y="83" width="14" height="22" rx="7" fill="currentColor" /></g><path className={styles["stroke"]} d="M93 120 Q100 127 107 120" strokeWidth={7}/></g></>;
    case "organize": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="69" y="87" width="22" height="13" rx="6.5" fill="currentColor" /><rect x="111" y="87" width="22" height="13" rx="6.5" fill="currentColor" /></g><path className={styles["stroke"]} d="M94 122 H106" strokeWidth={7}/></g></>;
    case "listen": return <><g className={styles["features"]}><g className={styles["eyes"]}><circle cx="78" cy="90" r="9" fill="currentColor"/><circle cx="122" cy="90" r="9" fill="currentColor"/></g><rect x="97" y="120" width="7" height="11" rx="3.5" fill="currentColor" /></g></>;
    case "aim": return <><g className={styles["features"]}><g className={styles["eyes"]}><path className={styles["stroke"]} d="M72 86 L88 93 M112 93 L128 86" strokeWidth={11}/></g><path className={styles["stroke"]} d="M92 124 H108" strokeWidth={8}/></g></>;
    case "shy": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="79" y="87" width="11" height="22" rx="5.5" fill="currentColor" /><rect x="115" y="87" width="11" height="22" rx="5.5" fill="currentColor" /></g><path className={styles["stroke"]} d="M97 123 Q104 128 110 122" strokeWidth={6}/><path className={styles["stroke"]} d="M64 115 L70 118 M130 118 L136 115" strokeWidth={4}/></g></>;
    case "determined": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="72" y="84" width="13" height="23" rx="6.5" fill="currentColor" transform="rotate(-20 78 95)"/><rect x="115" y="84" width="13" height="23" rx="6.5" fill="currentColor" transform="rotate(20 121 95)"/></g><path className={styles["stroke"]} d="M90 124 Q100 112 110 124" strokeWidth={9}/></g></>;
    case "bored": return <><g className={styles["features"]}><g className={styles["eyes"]}><rect x="69" y="91" width="23" height="7" rx="3.5" fill="currentColor" /><rect x="111" y="91" width="23" height="7" rx="3.5" fill="currentColor" /></g><rect x="91" y="124" width="18" height="5" rx="2.5" fill="currentColor" /></g></>;
    case "excited": return <><g className={styles["features"]}><g className={styles["eyes"]}><path className={styles["stroke"]} d="M70 82 L83 94 L70 104 M130 82 L117 94 L130 104" strokeWidth={9}/></g><path d="M89 119 Q100 123 111 119 Q109 138 100 138 Q91 138 89 119Z" fill="currentColor"/></g></>;
  }
}
function Shell({ variant }: { variant: Exclude<RunActivityVariant, "team"> }) {
  switch (variant) {
    case "general": return <><path className={styles["stroke"]} d="M58 56 C34 82 32 120 56 144 M142 56 C166 82 168 120 144 144" strokeWidth={15}/></>;
    case "code": return <><path className={styles["stroke"]} d="M65 48 C47 48 46 59 46 72 L46 82 Q46 96 33 100 Q46 104 46 118 L46 128 C46 141 47 152 65 152 M135 48 C153 48 154 59 154 72 L154 82 Q154 96 167 100 Q154 104 154 118 L154 128 C154 141 153 152 135 152" strokeWidth={13}/></>;
    case "knowledge": return <><path className={styles["stroke"]} d="M63 50 H42 V150 H63 M137 50 H158 V150 H137" strokeWidth={13}/></>;
    case "agent": return <><path className={styles["stroke"]} d="M65 53 H39 V84 M135 147 H161 V116" strokeWidth={13}/></>;
    case "executor": return <><path className={styles["stroke"]} d="M57 55 L35 145 M165 55 L143 145" strokeWidth={14}/></>;
  }
}

/** All visible strokes inherit currentColor; the team overlap uses a transparent mask. */
export function AgentCharacter({ variant, expression }: { variant: RunActivityVariant; expression?: RunActivityExpression }) {
  const maskId = useId();
  if (!expression) return <AgentDefaultPose variant={variant} />;
  if (variant !== "team") return <><Shell variant={variant} /><Face expression={expression} />
    {variant === "knowledge" && <g className={styles.scan}><path className={styles.stroke} d="M69 111 H131" strokeWidth={4} /></g>}</>;
  return <>
    <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
      <rect width="200" height="200" fill="white" />
      <circle cx="101" cy="128.56" r="53.82" fill="black" />
    </mask></defs>
    <g mask={`url(#${maskId})`}>
      <g transform="translate(4 18) scale(.58)"><g className={styles.companion}><path className={styles.stroke} d="M58 56 C34 82 32 120 56 144" strokeWidth={15} /><Face expression="excited" /></g></g>
      <g transform="translate(82 18) scale(.58)"><g className={`${styles.companion} ${styles.right}`}><path className={styles.stroke} d="M142 56 C166 82 168 120 144 144" strokeWidth={15} /><Face expression="curious" /></g></g>
    </g>
    <g transform="translate(23 52.12) scale(.78)"><Shell variant="general" /><Face expression={expression} /></g>
  </>;
}
