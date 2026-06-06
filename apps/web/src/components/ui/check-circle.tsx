/**
 * CheckCircle — task completion atom.
 * done  = filled circle + checkSm icon stroke #04130c
 * undone = 2px border ring
 * Port of kit.jsx:248-257
 */
import { Icon } from "./icon";

export type CheckCircleProps = {
  done: boolean;
  color?: string;
  size?: number;
  className?: string;
};

export function CheckCircle({
  done,
  color = "#19c37d",
  size = 22,
  className,
}: CheckCircleProps) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        border: done ? "none" : "2px solid rgba(255,255,255,0.14)",
        background: done ? color : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-hidden
    >
      {done && (
        <Icon name="checkSm" size={Math.round(size * 0.6)} stroke="#04130c" sw={2.6} />
      )}
    </div>
  );
}
