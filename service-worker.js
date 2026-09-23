// 🚀 SERVICE WORKER - ESTRATEGIA INTELIGENTE DE CACHING

const CACHE_NAME = "cancionero-v3";
const CACHE_EDAD_MAX = 7 * 24 * 60 * 60 * 1000; // 7 días

const ASSETS = [
    "./",
    "./index.html",
    "./manifest.json",
    "./style.css",
    "./app.js",
    "./sync.js",
    "./supabase-config.js",
    "./canciones.json",
    "./icon-192.png"
];

// ========== INSTALACIÓN ==========

self.addEventListener("install", (evento) => {
    console.log("🚀 SW: Instalando...");
    self.skipWaiting();
    evento.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// ========== ACTIVACIÓN - LIMPIAR CACHE VIEJO ==========

self.addEventListener("activate", (evento) => {
    console.log("🚀 SW: Activando...");
    evento.waitUntil(self.clients.claim());
    evento.waitUntil(
        caches.keys().then((nombres) => {
            return Promise.all(
                nombres.map((nombre) => {
                    if (nombre !== CACHE_NAME) {
                        console.log("🧹 Eliminando cache viejo:", nombre);
                        return caches.delete(nombre);
                    }
                })
            );
        })
    );
});

// ========== FETCH - ESTRATEGIA INTELIGENTE ==========

self.addEventListener("fetch", (evento) => {
    const url = evento.request.url;

    // 1. DATOS desde Supabase → Network-first
    if (url.includes("supabase.co")) {
        evento.respondWith(networkFirstStrategy(evento.request));
        return;
    }

    // 2. ASSETS (CSS, JS, HTML, PNG) → Cache-first
    if (esAsset(url)) {
        evento.respondWith(cacheFirstStrategy(evento.request));
        return;
    }

    // 3. OTROS → Network-first con fallback
    evento.respondWith(networkFirstStrategy(evento.request));
});

// ========== ESTRATEGIA: NETWORK-FIRST (Datos) ==========

async function networkFirstStrategy(request) {
    const cacheKey = new URL(request.url).pathname;

    try {
        // Intenta traer de la red primero
        const respuesta = await fetch(request);

        // Si es exitosa, cachearla
        if (respuesta.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(cacheKey, respuesta.clone());
        }

        return respuesta;

    } catch (error) {
        // Si falla la red, usar cache
        console.log("📡 Error de red, usando cache para:", cacheKey);
        const cached = await caches.match(cacheKey);

        if (cached) {
            return cached;
        }

        // Si no hay cache, error offline
        return new Response("Offline - Sin datos disponibles", {
            status: 503,
            statusText: "Service Unavailable"
        });
    }
}

// ========== ESTRATEGIA: CACHE-FIRST (Assets) ==========

async function cacheFirstStrategy(request) {
    // Buscar en cache primero
    const cached = await caches.match(request);

    if (cached) {
        // Verificar que no sea muy viejo
        const edad = Date.now() - new Date(cached.headers.get("date")).getTime();

        if (edad < CACHE_EDAD_MAX) {
            return cached;
        }
    }

    // Si no está en cache o es viejo, traer de la red
    try {
        const respuesta = await fetch(request);

        if (respuesta.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, respuesta.clone());
        }

        return respuesta;

    } catch (error) {
        console.log("Error trayendo asset:", request.url);

        // Última opción: devolver lo que hay en cache aunque sea viejo
        if (cached) {
            return cached;
        }

        return new Response("Offline", { status: 503 });
    }
}

// ========== UTILIDADES ==========

function esAsset(url) {
    const extensiones = [
        ".html", ".css", ".js", ".json",
        ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
        ".woff", ".woff2", ".ttf", ".eot"
    ];

    return extensiones.some(ext => url.endsWith(ext));
}

// ========== BACKGROUND SYNC (Opcional - futuro) ==========
// Cuando vuelva Internet, sincronizar cambios pendientes

self.addEventListener("sync", (evento) => {
    if (evento.tag === "sincronizar-cancionero") {
        evento.waitUntil(sincronizarCambios());
    }
});

async function sincronizarCambios() {
    console.log("🔄 Background Sync: Sincronizando cambios...");
    // Esto se puede conectar con el sincronizador
    // Enviar mensaje a la app para que sincronice
    self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
            client.postMessage({
                tipo: "sincronizar"
            });
        });
    });
}
