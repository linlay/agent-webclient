import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export const TerminalDock: React.FC = () => {
  const terminalRef = useRef<Terminal>(new Terminal());
  const containerRef = useRef<HTMLDivElement>(null);
  const commandRef = useRef<string>("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    terminalRef.current = new Terminal();
    const fitAddon = new FitAddon();
    terminalRef.current.loadAddon(fitAddon);
    terminalRef.current.open(container);
    fitAddon.fit();

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    terminalRef.current.write("welcome for using agent-webclient\r\n$ ");
    terminalRef.current.onData((data) => {
      if (data === "\r") {
        // 回车
        terminalRef.current.write(commandRef.current + "\r\n$ ");
        commandRef.current = "";
      } else if (data === "\u007f") {
        // 退格
        if (commandRef.current.length > 0) {
          commandRef.current = commandRef.current.slice(0, -1);
          terminalRef.current.write("\b \b");
        }
      } else {
        commandRef.current += data;
        terminalRef.current.write(data);
      }
    });
    return () => {
      window.removeEventListener("resize", handleResize);
      terminalRef.current.dispose();
    };
  }, []);

  return (
    <section
      ref={containerRef}
      className="terminal-dock"
      aria-label="终端面板"
    ></section>
  );
};
