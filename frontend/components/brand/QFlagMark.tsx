/**
 * BerthIQ's mark: the international "Q" signal flag on a mast. Flown by a ship
 * requesting clearance — the flag of a ship waiting on its paperwork.
 */
export function QFlagMark({ size = 24, title }: { size?: number; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path d="M8 3.5v25" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M9.5 5h17.5v13H9.5z" fill="#f2c230" />
      <path d="M5 28.5h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
