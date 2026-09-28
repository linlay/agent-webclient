import styles from "./BusyInk.module.css";

/**
 * 通用「墨流」加载动效（antd 6 Image loading 同源语言）。
 *
 * 纯装饰、无交互、无文案：塞进任意已定位的盒子即可，自带 overflow 裁剪。
 * 与 `MaterialIcon` 同理，只是一个视觉基底组件；文案与语义（`role="status"`、
 * `aria-busy`）由消费者自己挂在容器上。
 */
export const BusyInk: React.FC<{ className?: string }> = ({ className }) => (
  <div
    className={[styles.root, className].filter(Boolean).join(" ")}
    aria-hidden="true"
  >
    <div className={styles.ink1}></div>
    <div className={styles.ink2}></div>
  </div>
);
