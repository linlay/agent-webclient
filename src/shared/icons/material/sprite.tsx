import materialIconSpriteUrl from "./sprite.svg";
import { getMaterialIconSymbolId, type MaterialIconName } from "./registry";

export function getMaterialIconHref(name: MaterialIconName): string {
  const symbolId = getMaterialIconSymbolId(name);
  if (typeof document !== "undefined" && document.getElementById("material-icon-sprite")) {
    return `#${symbolId}`;
  }
  return `${materialIconSpriteUrl}#${symbolId}`;
}
