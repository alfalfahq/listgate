/** The Listgate wordmark. Navy on light backgrounds, white on dark. Swap for the PNG logo in /public when it's added. */
export function Logo({ height = 28, white = false }: { height?: number; white?: boolean }) {
  return (
    <span aria-label="Listgate" style={{ fontSize: height * 0.86, lineHeight: 1 }} className={`inline-flex items-center gap-1.5 font-extrabold tracking-tight ${white ? "text-white" : "text-navy"}`}>
      <svg aria-hidden="true" viewBox="0 0 32 32" style={{ height, width: height }}>
        <rect width="32" height="32" rx="8" fill={white ? "#2ac4ea" : "#0d2d4f"} />
        <path d="M9 8v16M23 8v16M9 12h14M9 18h14" stroke={white ? "#0d2d4f" : "#2ac4ea"} strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      <span>list<span className="text-cyan">gate</span></span>
    </span>
  );
}
