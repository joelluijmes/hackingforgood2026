import { useId } from 'react';

/** BLOOM Studio logo mark: a five-petal flower (growth, care for children). */
export default function BloomMark({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      className="bloom-mark"
    >
      <title>BLOOM Studio</title>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fd6b4" />
          <stop offset="1" stopColor="#28759f" />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`}>
        {[0, 72, 144, 216, 288].map((deg) => (
          <ellipse
            key={deg}
            cx="32"
            cy="17"
            rx="8.5"
            ry="14"
            transform={`rotate(${deg} 32 32)`}
            opacity="0.92"
          />
        ))}
      </g>
      <circle cx="32" cy="32" r="7" fill="#fff4d6" />
      <circle cx="32" cy="32" r="3" fill="#f4c542" />
    </svg>
  );
}
