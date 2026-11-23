import { Collapse } from "antd";
import Style from "./TimelineCollapse.module.css";
import { useState } from "react";
import { notifyLocalLayoutToggle } from "@/shared/utils/localLayoutToggle";

interface TimelineCollapseProps {
  label: React.ReactNode;
  children: React.ReactNode;
  expanded?: boolean;
  onExpand?: (expanded: boolean) => void;
  destroyOnHidden?: boolean;
  expandIconPosition?: "start" | "end";
  className?: string;
}

const KEY = "TimelineCollapse";
export const TimelineCollapse: React.FC<TimelineCollapseProps> = ({
  label,
  expanded,
  children,
  onExpand,
  destroyOnHidden,
  expandIconPosition = "end",
  className,
}) => {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false);
  const isExpanded = expanded ?? uncontrolledExpanded;
  return (
    <Collapse
      ghost
      activeKey={isExpanded ? [KEY] : []}
      onChange={(keys) => {
        const nextExpanded = keys.includes(KEY);
        // 思考、工具、来源、等待、awaiting 都用这个折叠体：展开/收起会让条目
        // 原地长高，先告诉时间线舞台别按新输出贴底。
        notifyLocalLayoutToggle();
        if (expanded === undefined) setUncontrolledExpanded(nextExpanded);
        onExpand?.(nextExpanded);
      }}
      className={[Style.Collapse, className].filter(Boolean).join(" ")}
      destroyOnHidden={destroyOnHidden}
      expandIconPosition={expandIconPosition}
      items={[
        {
          key: KEY,
          label,
          children,
        },
      ]}
    />
  );
};
