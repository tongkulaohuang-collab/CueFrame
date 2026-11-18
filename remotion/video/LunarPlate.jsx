import React from "react";
import { Img } from "remotion";
const sand = "#f8db9f",
  night = "#182b38",
  pale = "#d8e7df";
export function MoonDisk({ x, y, r, angle, texture = false, surface }) {
  const mask = React.useId().replace(/[^a-z0-9-]/gi, "");
  const k = Math.cos(angle),
    arc = Math.max(0.01, Math.abs(k) * r);
  const lit =
    "M0 " +
    -r +
    " A" +
    r +
    " " +
    r +
    " 0 0 1 0 " +
    r +
    " A" +
    arc +
    " " +
    r +
    " 0 0 " +
    (k >= 0 ? 0 : 1) +
    " 0 " +
    -r +
    "Z";
  return (
    <g transform={"translate(" + x + " " + y + ")"}>
      <circle r={r} fill={night} stroke="#627877" strokeWidth={r * 0.006} />
      <path d={lit} fill={sand} />
      {surface ? (
        <>
          <defs>
            <clipPath id={mask}>
              <path d={lit} />
            </clipPath>
          </defs>
          <g clipPath={"url(#" + mask + ")"}>
            <foreignObject x={-r} y={-r} width={2 * r} height={2 * r}>
              <Img
                src={surface}
                style={{
                  width: "100%",
                  height: "100%",
                  display: "block",
                  filter: "sepia(.20) brightness(1.13)",
                }}
              />
            </foreignObject>
          </g>
        </>
      ) : (
        texture && (
          <svg
            x={-r}
            y={-r}
            width={2 * r}
            height={2 * r}
            viewBox="-100 -100 200 200"
          >
            <defs>
              <clipPath id={mask}>
                <path d={lit} transform={"scale(" + 100 / r + ")"} />
              </clipPath>
            </defs>
            <g clipPath={"url(#" + mask + ")"} fill="#8b7559" opacity=".27">
              {[
                [-52, -27, 12],
                [33, -43, 14],
                [18, 23, 19],
                [46, 44, 8],
                [-20, 59, 9],
                [-9, -70, 6],
                [52, -9, 7],
                [-55, 23, 8],
                [30, 11, 4],
                [-6, -30, 5],
              ].map(([cx, cy, rr]) => (
                <g key={cx}>
                  <ellipse cx={cx} cy={cy} rx={rr} ry={rr * 0.76} />
                  <path
                    d={
                      "M" +
                      (cx - rr * 0.65) +
                      " " +
                      (cy + rr * 0.35) +
                      "q" +
                      rr +
                      " " +
                      rr * 0.52 +
                      " " +
                      rr * 1.5 +
                      " " +
                      -rr * 0.27
                    }
                    fill="none"
                    stroke="#faf0bf"
                    strokeWidth="1.9"
                  />
                </g>
              ))}
            </g>
          </svg>
        )
      )}
    </g>
  );
}
// A top-down explanatory diagram. Sunlight stays on the left while the observer's lit fraction grows.
export function LunarPlate({
  phase,
  mix,
  progress,
  portrait,
  surface,
  opening,
}) {
  const width = portrait ? 700 : 1200,
    height = portrait ? 690 : 420;
  const orbitX = width * (portrait ? 0.35 : 0.28),
    orbitY = height * 0.56,
    rx = width * (portrait ? 0.21 : 0.155),
    ry = height * 0.275;
  const theta = Math.PI * progress,
    mx = orbitX - rx * Math.cos(theta),
    my = orbitY - ry * Math.sin(theta);
  const heroX = width * (portrait ? 0.52 : 0.59),
    detailX = width * (portrait ? 0.75 : 0.76);
  const weight = phase === 0 ? 0 : phase === 1 ? mix : 1;
  const radius =
    height *
    (portrait ? 0.23 : 0.355) *
    (1 - 0.24 * weight) *
    (1 + 0.075 * (1 - opening) * (1 - weight));
  return (
    <svg
      className="lunar-plate"
      width="100%"
      height="100%"
      viewBox={"0 0 " + width + " " + height}
      aria-label="月相示意：平行光从左照来，与地球所见的亮面相对应"
      role="img"
    >
      <g fill="#a8c3ba">
        {Array.from({ length: 44 }, (_, i) => (
          <circle
            key={i}
            cx={(i * 227 + 59) % width}
            cy={(i * 91 + 23) % height}
            r={i % 6 === 0 ? 1.7 : 1}
            opacity={0.24 + (i % 5) * 0.08}
          />
        ))}
      </g>
      <g opacity={weight}>
        <ellipse
          cx={orbitX}
          cy={orbitY}
          rx={rx}
          ry={ry}
          fill="none"
          stroke="#557478"
          strokeWidth="2"
          strokeDasharray="5 9"
        />
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            d={
              "M10 " +
              (orbitY - 76 + i * 31) +
              "h" +
              width * 0.081 +
              "l-8 -5m8 5l-8 5"
            }
            fill="none"
            stroke={sand}
            strokeWidth="3"
          />
        ))}
        <path
          d={"M" + orbitX + " " + orbitY + "L" + mx + " " + my}
          stroke="#9fcbbe"
          strokeWidth="2.3"
          strokeDasharray="8 5"
        />
        <circle cx={orbitX} cy={orbitY} r={22} fill="#7bc2b2" />
        <circle cx={mx} cy={my} r={17} fill="#354956" />
        <path
          transform={"translate(" + mx + " " + my + ")"}
          d="M0 -17A17 17 0 0 0 0 17Z"
          fill={sand}
        />
        <text
          x={orbitX}
          y={orbitY + 70}
          fill={pale}
          textAnchor="middle"
          fontSize={portrait ? 32 : 49}
        >
          地球
        </text>
        <text x={12} y={orbitY + 56} fill={sand} fontSize={portrait ? 30 : 49}>
          日光
        </text>
      </g>
      <MoonDisk
        x={heroX + (detailX - heroX) * weight}
        y={height * 0.49}
        r={radius}
        angle={theta}
        texture
        surface={surface}
      />
      <text
        x={heroX + (detailX - heroX) * weight}
        y={height * 0.49 + radius + 49}
        fontSize={portrait ? 30 : 49}
        fill={pale}
        textAnchor="middle"
      >
        {phase === 0
          ? "从地球看"
          : progress < 0.43
            ? "娥眉月附近"
            : progress < 0.58
              ? "上弦附近"
              : progress < 0.91
                ? "盈凸月"
                : "满月附近"}
      </text>
      <text
        x="12"
        y={height - 12}
        fill="#b4c8bf"
        fontSize={portrait ? 23 : 27}
        opacity={weight}
      >
        轨道示意 · 非等比
      </text>
    </svg>
  );
}
