// Runs partner pushes inside the web app: a loop every DELIVER_EVERY_SECONDS, plus an immediate run
// whenever a feed queues something. Deliveries are claimed with row locks, so more than one instance is fine.
import { deliverDue, getDb } from "@listgate/db";
import { config } from "./config";

declare global {
  // eslint-disable-next-line no-var
  var __listgate_deliver: { running: boolean; again: boolean; timer?: NodeJS.Timeout } | undefined;
}
const state = (globalThis.__listgate_deliver ??= { running: false, again: false });

export function kickDeliveries() {
  if (state.running) {
    state.again = true;
    return;
  }
  state.running = true;
  void (async () => {
    try {
      const db = await getDb();
      do {
        state.again = false;
        // Keep going while there's a full batch waiting.
        for (let i = 0; i < 20; i++) {
          const r = await deliverDue(db, 50);
          if (r.sent + r.failed < 50) break;
        }
      } while (state.again);
    } catch (e) {
      console.error("[deliver]", e);
    } finally {
      state.running = false;
    }
  })();
}

export function startDeliveryLoop() {
  if (state.timer || !config.deliverEverySeconds) return;
  state.timer = setInterval(kickDeliveries, config.deliverEverySeconds * 1000);
  state.timer.unref?.();
  kickDeliveries();
}
