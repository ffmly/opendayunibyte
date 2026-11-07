const CACHE = "unibyte-open-day-v2";
const PRECACHE_URLS = ["/", "/dashboard", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .catch(() => {}),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 1. Never intercept or cache external domains, Supabase auth/data, or cloud functions
  if (url.origin !== self.location.origin) return;

  // 2. Never cache API endpoints, auth endpoints, or requests with authorization headers
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    request.headers.has("authorization")
  ) {
    return;
  }

  // 3. Navigation requests: network-first. Never cache dynamic workshop or quiz routes offline.
  if (request.mode === "navigate") {
    // Only allow offline fallback for static root shells, never for dynamic deep links
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && (url.pathname === "/" || url.pathname === "/dashboard")) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => {
          if (url.pathname === "/" || url.pathname === "/dashboard") {
            return caches.match(request).then((r) => r || caches.match("/"));
          }
          // Do not hijack dynamic route failures with root HTML to prevent hydration/blank issues
          return Promise.reject(new Error("Network unavailable"));
        }),
    );
    return;
  }

  // 4. Static assets only: cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".webmanifest")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
    return;
  }
});
