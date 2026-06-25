import materialIconSpriteUrl from "./sprite.svg";
import { getMaterialIconSymbolId, type MaterialIconName } from "./registry";

export function getMaterialIconHref(name: MaterialIconName): string {
  return `${materialIconSpriteUrl}#${getMaterialIconSymbolId(name)}`;
}
