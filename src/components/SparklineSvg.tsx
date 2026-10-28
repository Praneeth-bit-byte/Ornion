import React from "react";

interface SparklineSvgProps {
  data: number[];
  isPositive: boolean;
}

export const SparklineSvg: React.FC<SparklineSvgProps> = ({ data, isPositive }) => {
  if (!data || data.length < 2) {
    return <div className="w-[88px] h-[26px]" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((val, idx) => {
      const x = ((idx / (data.length - 1)) * 88).toFixed(1);
      const y = (24 - ((val - min) / range) * 20).toFixed(1);
      return `${x},${y}`;
    })
    .join(" ");

  const strokeColor = isPositive ? "#3dffa2" : "#ff5a6e";

  return (
    <svg
      viewBox="0 0 88 26"
      className="w-[88px] h-[26px] shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};
