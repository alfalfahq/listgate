// Starts the partner push loop when the web server boots (not during builds or in the edge runtime).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    const { startDeliveryLoop } = await import("./lib/deliver");
    startDeliveryLoop();
  }
}
