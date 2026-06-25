import React from "react";
import { type MaterialIconName } from "./registry";
import { getMaterialIconHref } from "./sprite";

export interface MaterialIconProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  name: MaterialIconName;
}

export const MaterialIcon: React.FC<MaterialIconProps> = ({
  name,
  className = "",
  ...props
}) => {
  const href = getMaterialIconHref(name);

  return (
    <span
      className={`material-icon ${className}`.trim()}
      data-material-icon={name}
      {...props}
    >
      <svg
        className="material-icon-svg"
        aria-hidden="true"
        focusable="false"
      >
        <use href={href} />
      </svg>
    </span>
  );
};
