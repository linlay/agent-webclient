import { Collapse } from "antd";
import Style from "./index.module.css";
import { useState } from "react";

interface TimelineCollapseProps {
  label: React.ReactNode;
  children: React.ReactNode;
  expanded?: boolean;
  onExpand?: (expanded: boolean) => void;
  destroyOnHidden?: boolean;
}

const KEY = "TimelineCollapse";
export const TimelineCollapse: React.FC<TimelineCollapseProps> = ({
  label,
  expanded,
  children,
  onExpand,
  destroyOnHidden,
}) => {
  const [activeKey, setActiveKey] = useState(expanded ? [KEY] : []);
  return (
    <Collapse
      ghost
      activeKey={activeKey}
      onChange={(keys) => {
        onExpand?.(keys.includes(KEY));
        setActiveKey(keys);
      }}
      className={Style.Collapse}
      destroyOnHidden={destroyOnHidden}
      expandIconPosition="end"
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
