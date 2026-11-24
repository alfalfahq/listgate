// After a deploy, a page opened earlier calls server actions the new server no longer has.
// Rather than breaking, reload to get the current page (the change is lost, so it's simply redone).
export async function safely(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    if (typeof window !== "undefined") window.location.reload();
  }
}
