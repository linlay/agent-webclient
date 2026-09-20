import defaultIcon from "./agent-icons/default.svg";
import atlasIcon from "./agent-icons/atlas.svg";
import canvasIcon from "./agent-icons/canvas.svg";
import chatIcon from "./agent-icons/chat.svg";
import chimeIcon from "./agent-icons/chime.svg";
import chronosIcon from "./agent-icons/chronos.svg";
import coderIcon from "./agent-icons/coder.svg";
import cortexIcon from "./agent-icons/cortex.svg";
import databaseIcon from "./agent-icons/database.svg";
import emitIcon from "./agent-icons/emit.svg";
import fastIcon from "./agent-icons/fast.svg";
import fluxIcon from "./agent-icons/flux.svg";
import focusIcon from "./agent-icons/focus.svg";
import folderIcon from "./agent-icons/folder.svg";
import horizonIcon from "./agent-icons/horizon.svg";
import ideIcon from "./agent-icons/ide.svg";
import identityIcon from "./agent-icons/identity.svg";
import kbaseIcon from "./agent-icons/kbase.svg";
import libraryIcon from "./agent-icons/library.svg";
import lunaIcon from "./agent-icons/luna.svg";
import peaksIcon from "./agent-icons/peaks.svg";
import portalIcon from "./agent-icons/portal.svg";
import pulseIcon from "./agent-icons/pulse.svg";
import resonanceIcon from "./agent-icons/resonance.svg";
import sentinelIcon from "./agent-icons/sentinel.svg";
import solIcon from "./agent-icons/sol.svg";
import sparkIcon from "./agent-icons/spark.svg";
import spectrumIcon from "./agent-icons/spectrum.svg";
import statueIcon from "./agent-icons/statue.svg";
import stratusIcon from "./agent-icons/stratus.svg";
import terminalIcon from "./agent-icons/terminal.svg";
import waveIcon from "./agent-icons/wave.svg";

export const AGENT_ICON_NAMES = [
  "folder", "chat", "wave", "focus", "library", "coder", "kbase", "canvas",
  "ide", "fast", "peaks", "flux", "pulse", "spark", "horizon", "emit",
  "database", "stratus", "sentinel", "identity", "spectrum", "chime",
  "sol", "atlas", "chronos", "statue", "portal", "resonance", "luna",
  "cortex", "terminal",
] as const;

const ICONS: Record<(typeof AGENT_ICON_NAMES)[number], string> = {
  folder: folderIcon, chat: chatIcon, wave: waveIcon, focus: focusIcon,
  library: libraryIcon, coder: coderIcon, kbase: kbaseIcon, canvas: canvasIcon,
  ide: ideIcon, fast: fastIcon, peaks: peaksIcon, flux: fluxIcon,
  pulse: pulseIcon, spark: sparkIcon, horizon: horizonIcon, emit: emitIcon,
  database: databaseIcon, stratus: stratusIcon, sentinel: sentinelIcon,
  identity: identityIcon, spectrum: spectrumIcon, chime: chimeIcon,
  sol: solIcon, atlas: atlasIcon, chronos: chronosIcon, statue: statueIcon,
  portal: portalIcon, resonance: resonanceIcon, luna: lunaIcon,
  cortex: cortexIcon, terminal: terminalIcon,
};

export function getAgentIconSource(iconName?: string): string {
  return iconName && Object.hasOwn(ICONS, iconName)
    ? ICONS[iconName as keyof typeof ICONS]
    : defaultIcon;
}
