// SalesIQ service worker: receives web push (new leads, client messages,
// incoming calls, tasks, support answers) while no tab is open, opens the
// right page when a notification is clicked, and shows a small offline
// page instead of the browser's error when a page can't load. It caches
// nothing else -- SalesIQ always works against the live server.

const OFFLINE_HTML = `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SalesIQ</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;background:#f6f7fb;color:#0f172a}@media(prefers-color-scheme:dark){body{background:#0b1020;color:#e2e8f0}}main{text-align:center;padding:24px;max-width:360px}img{width:64px;height:64px}h1{font-size:20px;margin:16px 0 8px}p{margin:0 0 20px;opacity:.75;line-height:1.5}button{border:0;border-radius:12px;padding:12px 20px;font-size:15px;font-weight:600;background:#1d4ed8;color:#fff;cursor:pointer}</style></head><body><main><img src="/icon-192.png" alt=""><h1>Internet aloqasi yo'q</h1><p>SalesIQ ishlashi uchun internet kerak. Aloqa tiklangach sahifani yangilang.</p><button onclick="location.reload()">Qayta urinish</button></main></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open("salesiq-shell-v1")
      .then((c) => c.add("/icon-192.png"))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Page loads (and the offline page's logo) only: everything else goes
// straight to the network untouched.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method === "GET" && new URL(req.url).pathname === "/icon-192.png") {
    event.respondWith(fetch(req).catch(() => caches.match("/icon-192.png")));
    return;
  }
  if (req.mode !== "navigate" || req.method !== "GET") return;
  event.respondWith(
    fetch(req).catch(
      () =>
        new Response(OFFLINE_HTML, {
          status: 503,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    ),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "SalesIQ", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "SalesIQ";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "salesiq",
    renotify: true,
    requireInteraction: !!data.requireInteraction,
    timestamp: Date.now(),
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/";
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          // navigate() only works on a tab this worker controls.
          return client
            .focus()
            .then((c) => c.navigate(url))
            .catch(() => self.clients.openWindow(url));
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    }),
  );
});
