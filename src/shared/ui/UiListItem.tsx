import React from "react";

export interface UiListItemProps extends React.ButtonHTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  dense?: boolean;
  loading?: boolean;
}

export const UiListItem = React.forwardRef<HTMLDivElement, UiListItemProps>(
  (
    {
      selected = false,
      dense = false,
      loading = false,
      className = "",
      children,
      ...rest
    },
    ref,
  ) => {
    const classes = [
      "ui-list-item",
      selected ? "is-selected" : "",
      dense ? "is-dense" : "",
      loading ? "is-loading" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        ref={ref}
        className={classes}
        aria-busy={loading || undefined}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

UiListItem.displayName = "UiListItem";
