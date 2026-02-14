// src/components/TriRadar.tsx
import React from "react";

type Props = {
  taste: number; // 0..10
  atmosphere: number; // 0..10
  service: number; // 0..10
  size?: number; // px
  showLabels?: boolean;
  className?: string;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
function lerp(
  p: { x: number; y: number },
  q: { x: number; y: number },
  k: number
) {
  return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
}

/**
 * TriRadar (3軸レーダー)
 * - taste / atmosphere / service を 0..10 で受け取り、正三角形の内側を塗りつぶす
 * - SVGなので軽い & SSRでもOK
 */
export default function TriRadar({
  taste,
  atmosphere,
  service,
  size = 120,
  showLabels = true,
  className,
}: Props) {
  const t = clamp01(taste / 10);
  const a = clamp01(atmosphere / 10);
  const s = clamp01(service / 10);

  const w = size;
  const h = size;

  // 余白
  const pad = Math.round(size * 0.12);

  const cx = w / 2;
  const cy = h / 2;

  // 正三角形（上・左下・右下）
  const top = { x: cx, y: pad };
  const left = { x: pad, y: h - pad };
  const right = { x: w - pad, y: h - pad };

  // 中心（ちょい下にすると視覚バランス◎）
  const c = { x: cx, y: cy + pad * 0.1 };

  // 各軸方向へスコア分進める
  const ptTaste = lerp(c, top, t);
  const ptAtmos = lerp(c, right, a);
  const ptService = lerp(c, left, s);

  const outer = `${top.x},${top.y} ${right.x},${right.y} ${left.x},${left.y}`;
  const inner = `${ptTaste.x},${ptTaste.y} ${ptAtmos.x},${ptAtmos.y} ${ptService.x},${ptService.y}`;

  // 薄いグリッド（三角形を3段）
  const gridKs = [0.33, 0.66, 1.0];
  const grids = gridKs.map((k) => {
    const gTop = lerp(c, top, k);
    const gRight = lerp(c, right, k);
    const gLeft = lerp(c, left, k);
    return `${gTop.x},${gTop.y} ${gRight.x},${gRight.y} ${gLeft.x},${gLeft.y}`;
  });

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={["block", className ?? ""].join(" ").trim()}
      aria-label="tri radar"
      role="img"
    >
      {/* grid */}
      {grids.map((pts, i) => (
        <polygon
          key={i}
          points={pts}
          fill="none"
          stroke="rgba(15,23,42,0.08)"
          strokeWidth="1"
        />
      ))}

      {/* axes */}
      <line
        x1={c.x}
        y1={c.y}
        x2={top.x}
        y2={top.y}
        stroke="rgba(15,23,42,0.10)"
      />
      <line
        x1={c.x}
        y1={c.y}
        x2={right.x}
        y2={right.y}
        stroke="rgba(15,23,42,0.10)"
      />
      <line
        x1={c.x}
        y1={c.y}
        x2={left.x}
        y2={left.y}
        stroke="rgba(15,23,42,0.10)"
      />

      {/* outline */}
      <polygon
        points={outer}
        fill="none"
        stroke="rgba(15,23,42,0.18)"
        strokeWidth="1.25"
      />

      {/* filled shape */}
      <polygon
        points={inner}
        fill="rgba(249,115,22,0.28)"
        stroke="rgba(249,115,22,0.95)"
        strokeWidth="1.5"
      />

      {/* points */}
      {[ptTaste, ptAtmos, ptService].map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="rgba(249,115,22,0.95)" />
      ))}

      {/* labels */}
      {showLabels ? (
        <>
          <text
            x={top.x}
            y={top.y - 6}
            textAnchor="middle"
            fontSize="10"
            fill="rgba(15,23,42,0.65)"
          >
            味
          </text>
          <text
            x={right.x + 6}
            y={right.y + 2}
            textAnchor="start"
            fontSize="10"
            fill="rgba(15,23,42,0.65)"
          >
            雰囲気
          </text>
          <text
            x={left.x - 6}
            y={left.y + 2}
            textAnchor="end"
            fontSize="10"
            fill="rgba(15,23,42,0.65)"
          >
            サービス
          </text>
        </>
      ) : null}
    </svg>
  );
}
