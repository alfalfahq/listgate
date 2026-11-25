/** The Listgate logo (from the original listgate.com.au). Navy wordmark on light backgrounds, white on dark. */
export function Logo({ height = 28, white = false }: { height?: number; white?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={white ? "/listgate-logo-white.png" : "/listgate-logo.png"} alt="Listgate" style={{ height, width: "auto" }} />
  );
}
