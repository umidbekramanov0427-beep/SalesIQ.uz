// Copying text: the Clipboard API, and when the browser refuses it
// (permission denied, an http page, an older Safari) the old hidden-textarea
// copy, so "Nusxa olish" buttons work everywhere. Rejects only if both fail,
// for the caller's error message.
export async function copyText(value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Fall through to the textarea copy.
  }
  const el = document.createElement("textarea");
  el.value = value;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } finally {
    el.remove();
  }
  if (!ok) throw new Error("copy failed");
}
