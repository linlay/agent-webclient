/** Keep stable DOM hooks while attaching the CSS Module classes that own their styling. */
export function bindCssModuleClasses(styles: Record<string, string>) {
  return (className: string): string => {
    const local = className.split(/\s+/).map(name => styles[name]).filter(Boolean);
    return local.length ? [className, ...new Set(local)].join(" ") : className;
  };
}
