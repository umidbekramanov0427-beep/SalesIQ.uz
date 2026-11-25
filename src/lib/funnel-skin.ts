import { useEffect } from "react";

// Inside Voronkalar every window, menu and popover takes amoCRM's navy
// palette (styles.css, `.amo-skin`): they portal straight into <body>, so
// while a funnel page is open <body> carries `funnel-skin` and the CSS
// gives its dialogs and poppers the same tokens as the page.
export function useFunnelSkin() {
  useEffect(() => {
    document.body.classList.add("funnel-skin");
    return () => document.body.classList.remove("funnel-skin");
  }, []);
}
