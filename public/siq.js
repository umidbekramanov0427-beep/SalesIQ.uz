/* SalesIQ sayt hisoblagichi: <script async src="https://salesiq.uz/siq.js" data-key="KALIT"></script>
   Counts page views (a random visitor id, the page, where the visitor came
   from, UTM tags) and turns a form with a phone number into a lead. No
   cookies are shared with other sites; nothing else is read. */
(function () {
  try {
    var s = document.currentScript || document.querySelector("script[data-key][src*='siq.js']");
    if (!s) return;
    var key = s.getAttribute("data-key");
    var base = new URL(s.src).origin;
    if (!key) return;
    var rnd = function () {
      return (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).slice(0, 20);
    };
    var store = function (k, v, session) {
      try {
        var st = session ? sessionStorage : localStorage;
        if (v === undefined) return st.getItem(k);
        st.setItem(k, v);
      } catch (e) {}
      return v;
    };
    var vid = store("siq_vid") || store("siq_vid", rnd());
    var sid = store("siq_sid", undefined, true) || store("siq_sid", rnd(), true);
    var q = new URLSearchParams(location.search);
    // UTM tags are kept for the visit, so a form filled later still knows them.
    ["utm_source", "utm_medium", "utm_campaign"].forEach(function (k) {
      if (q.get(k)) store("siq_" + k, q.get(k).slice(0, 160), true);
    });
    var utm = function (k) {
      return store("siq_" + k, undefined, true) || null;
    };
    var w = window.innerWidth || 1024;
    var device = /Mobi|Android|iPhone/i.test(navigator.userAgent)
      ? w > 760
        ? "tablet"
        : "mobile"
      : "desktop";
    var send = function (path, body) {
      var data = JSON.stringify(body);
      if (navigator.sendBeacon && path === "/t/visit") {
        navigator.sendBeacon(base + path, new Blob([data], { type: "text/plain" }));
        return Promise.resolve();
      }
      return fetch(base + path, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: data,
        keepalive: true,
      });
    };
    var visit = function () {
      send("/t/visit", {
        k: key,
        v: vid,
        s: sid,
        u: location.href,
        r: document.referrer || null,
        us: utm("utm_source"),
        um: utm("utm_medium"),
        uc: utm("utm_campaign"),
        d: device,
      });
    };
    visit();
    // Single-page sites: count route changes too.
    var last = location.pathname;
    var push = history.pushState;
    history.pushState = function () {
      push.apply(this, arguments);
      if (location.pathname !== last) {
        last = location.pathname;
        visit();
      }
    };
    window.addEventListener("popstate", function () {
      if (location.pathname !== last) {
        last = location.pathname;
        visit();
      }
    });
    // A form with a phone number on the site: also a lead in SalesIQ.
    document.addEventListener(
      "submit",
      function (e) {
        var f = e.target;
        if (!f || !f.elements || f.hasAttribute("data-siq-skip")) return;
        var pick = function (re, type) {
          for (var i = 0; i < f.elements.length; i++) {
            var el = f.elements[i];
            var n = (el.name || el.id || el.placeholder || "").toLowerCase();
            if ((type && el.type === type) || re.test(n)) {
              if (el.value && String(el.value).trim()) return String(el.value).trim().slice(0, 200);
            }
          }
          return null;
        };
        var phone = pick(/phone|tel|telefon|nomer|raqam|номер|телефон/, "tel");
        if (!phone) return;
        send("/t/lead", {
          k: key,
          v: vid,
          s: sid,
          u: location.href,
          name: pick(/name|ism|имя|fio|фио/),
          phone: phone,
          email: pick(/mail|почта/, "email"),
          us: utm("utm_source"),
          um: utm("utm_medium"),
          uc: utm("utm_campaign"),
        }).catch(function () {});
      },
      true,
    );
  } catch (e) {}
})();
