/** The B and K monogram. The two letters lean on a shared stem. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Couple Budget">
      <rect width="64" height="64" rx="17" fill="#4b3fe4" />
      <g fill="none" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 17h9.5a7.5 7.5 0 0 1 0 15H15m0 0h11.5a7.5 7.5 0 0 1 0 15H15V17" stroke="#fff" />
        <path d="M40 17v30M53 17 40 32l13 15" stroke="#ffb7d3" />
      </g>
    </svg>
  );
}
