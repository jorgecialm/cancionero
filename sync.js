// 🔄 MÓDULO DE SINCRONIZACIÓN
// Gestiona: autenticación, INSERT/UPDATE/DELETE, cola de cambios, reintentos

class SincronizadorCancionero {
    constructor() {
        this.token = null;
        this.tieneConexion = navigator.onLine;
        this.estadoSincronizacion = "sincronizado";
        this.cambiosPendientes = [];
        this.intentosReintento = 0;
        this.maxReintentos = 5;

        this.cargarCambiosPendientes();
        this.configurarEventosConexion();
        this.sesionIniciada = this.iniciarSesion();
    }

    // ========== AUTENTICACIÓN ==========
    async iniciarSesion() {
        if (!SUPABASE_CONFIG_AVAILABLE || !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_EMAIL || !SUPABASE_PASSWORD) {
            console.warn("⚠️ Supabase no está configurado. La app continuará en modo local.");
            this.cambiarEstado("sincronizado");
            return;
        }

        try {
            const respuesta = await fetch(
                `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
                {
                    method: "POST",
                    headers: {
                        apikey: SUPABASE_ANON_KEY,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        email: SUPABASE_EMAIL,
                        password: SUPABASE_PASSWORD
                    })
                }
            );

            const datos = await respuesta.json();

            if (datos.access_token) {
                this.token = datos.access_token;
                sessionStorage.setItem("supabase_access_token", datos.access_token);
                console.log("✓ Autenticación exitosa");
                await this.sincronizarCambiosPendientes();
            } else {
                console.error("❌ Error de autenticación:", datos);
                this.cambiarEstado("error");
            }
        } catch (error) {
            console.error("❌ Error al autenticar:", error);
            this.cambiarEstado("error");
        }
    }

    obtenerToken() {
        return this.token || sessionStorage.getItem("supabase_access_token");
    }

    crearHeaders(extraHeaders = {}) {
        const headers = {
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
            ...extraHeaders
        };

        const token = this.obtenerToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        return headers;
    }

    async buscarCancionExistente(cancion) {
        const tituloLimpio = (cancion.titulo || "").trim();
        const parametros = new URLSearchParams({
            select: "*",
            titulo: `ilike.*${tituloLimpio}*`,
            limit: "1"
        });
        const respuesta = await fetch(
            `${SUPABASE_URL}/rest/v1/canciones?${parametros}`,
            { headers: this.crearHeaders() }
        );

        if (!respuesta.ok) {
            return null;
        }

        const cancionesEncontradas = await respuesta.json();
        return cancionesEncontradas[0] || null;
    }

    // ========== CRUD CON SUPABASE ==========

    async subirCancion(cancion, encolarEnFallo = true) {
        if (!SUPABASE_CONFIG_AVAILABLE || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
            console.warn("⚠️ Supabase no está configurado para subir canciones.");
            this.cambiarEstado("pendiente");
            return null;
        }

        if (!this.tieneConexion) {
            console.log("📡 Sin conexión - guardar en cola de pendientes");
            if (encolarEnFallo) this.agregarCambioPendiente("INSERT", cancion);
            this.cambiarEstado("pendiente");
            return { id: this.generarIdTemporal() };
        }

        if (this.sesionIniciada) {
            await this.sesionIniciada;
        }

        try {
            const { id: _id, ...datosCancion } = cancion;
            const respuesta = await fetch(`${SUPABASE_URL}/rest/v1/canciones`, {
                method: "POST",
                headers: this.crearHeaders({ Prefer: "return=representation" }),
                body: JSON.stringify(datosCancion)
            });

            const datos = await respuesta.json();

            if (!respuesta.ok) {
                if (respuesta.status === 409) {
                    const cancionExistente = await this.buscarCancionExistente(cancion);
                    if (cancionExistente) {
                        console.warn("⚠️ La canción ya existía; se reutilizará el registro existente.");
                        this.cambiarEstado("sincronizado");
                        return cancionExistente;
                    }

                    console.warn(
                        "⚠️ Supabase confirmó que la canción ya existe, pero no se pudo leer el registro existente. Se conservará la copia local:",
                        datos
                    );
                    this.cambiarEstado("sincronizado");
                    return cancion;
                }

                console.error("❌ Error al subir canción:", datos);
                if (encolarEnFallo) this.agregarCambioPendiente("INSERT", cancion);
                this.cambiarEstado("error");
                return null;
            }

            console.log("✓ Canción subida a Supabase:", datos[0] || datos);
            this.cambiarEstado("sincronizado");
            return datos[0] || datos;

        } catch (error) {
            console.error("❌ Error de conexión al subir:", error);
            if (encolarEnFallo) this.agregarCambioPendiente("INSERT", cancion);
            this.cambiarEstado("pendiente");
            return null;
        }
    }

    async actualizarCancion(id, cancion, encolarEnFallo = true) {
        if (!SUPABASE_CONFIG_AVAILABLE || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
            console.warn("⚠️ Supabase no está configurado para actualizar canciones.");
            this.cambiarEstado("pendiente");
            return false;
        }

        if (!this.tieneConexion) {
            console.log("📡 Sin conexión - guardar en cola de pendientes");
            if (encolarEnFallo) this.agregarCambioPendiente("UPDATE", { id, ...cancion });
            this.cambiarEstado("pendiente");
            return true;
        }

        if (this.sesionIniciada) {
            await this.sesionIniciada;
        }

        try {
            const respuesta = await fetch(
                `${SUPABASE_URL}/rest/v1/canciones?id=eq.${id}`,
                {
                    method: "PATCH",
                    headers: this.crearHeaders(),
                    body: JSON.stringify(cancion)
                }
            );

            if (!respuesta.ok) {
                console.error("❌ Error al actualizar canción");
                if (encolarEnFallo) this.agregarCambioPendiente("UPDATE", { id, ...cancion });
                this.cambiarEstado("error");
                return false;
            }

            console.log("✓ Canción actualizada en Supabase");
            this.cambiarEstado("sincronizado");
            return true;

        } catch (error) {
            console.error("❌ Error de conexión al actualizar:", error);
            if (encolarEnFallo) this.agregarCambioPendiente("UPDATE", { id, ...cancion });
            this.cambiarEstado("pendiente");
            return false;
        }
    }

    async eliminarCancion(id, encolarEnFallo = true) {
        if (!SUPABASE_CONFIG_AVAILABLE || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
            console.warn("⚠️ Supabase no está configurado para eliminar canciones.");
            this.cambiarEstado("pendiente");
            return false;
        }

        if (!this.tieneConexion) {
            console.log("📡 Sin conexión - guardar en cola de pendientes");
            if (encolarEnFallo) this.agregarCambioPendiente("DELETE", { id });
            this.cambiarEstado("pendiente");
            return true;
        }

        if (this.sesionIniciada) {
            await this.sesionIniciada;
        }

        try {
            const respuesta = await fetch(
                `${SUPABASE_URL}/rest/v1/canciones?id=eq.${id}`,
                {
                    method: "DELETE",
                    headers: this.crearHeaders()
                }
            );

            if (!respuesta.ok) {
                console.error("❌ Error al eliminar canción");
                if (encolarEnFallo) this.agregarCambioPendiente("DELETE", { id });
                this.cambiarEstado("error");
                return false;
            }

            console.log("✓ Canción eliminada de Supabase");
            this.cambiarEstado("sincronizado");
            return true;

        } catch (error) {
            console.error("❌ Error de conexión al eliminar:", error);
            if (encolarEnFallo) this.agregarCambioPendiente("DELETE", { id });
            this.cambiarEstado("pendiente");
            return false;
        }
    }

    // ========== COLA DE CAMBIOS PENDIENTES ==========

    agregarCambioPendiente(tipo, cancion) {
        const cambio = {
            tipo,
            cancion,
            timestamp: Date.now(),
            intentos: 0
        };

        this.cambiosPendientes.push(cambio);
        this.guardarCambiosPendientes();
        this.notificarCambio("pendiente");
    }

    cargarCambiosPendientes() {
        const guardados = localStorage.getItem("cambiosPendientes");
        if (guardados) {
            this.cambiosPendientes = JSON.parse(guardados);
            console.log("📋 Cambios pendientes cargados:", this.cambiosPendientes);
        }
    }

    guardarCambiosPendientes() {
        localStorage.setItem("cambiosPendientes", JSON.stringify(this.cambiosPendientes));
    }

    async sincronizarCambiosPendientes() {
        if (this.cambiosPendientes.length === 0) {
            console.log("✓ No hay cambios pendientes");
            return;
        }

        console.log("🔄 Sincronizando cambios pendientes...");
        this.cambiarEstado("pendiente");

        for (const cambio of [...this.cambiosPendientes]) {
            if (cambio.intentos >= this.maxReintentos) {
                console.error("⚠️ Máximo de reintentos alcanzado para:", cambio);
                continue;
            }

            let exito = false;

            try {
                if (cambio.tipo === "INSERT") {
                    const resultado = await this.subirCancion(cambio.cancion, false);
                    exito = resultado !== null;
                } else if (cambio.tipo === "UPDATE") {
                    const { id, ...datos } = cambio.cancion;
                    exito = await this.actualizarCancion(id, datos, false);
                } else if (cambio.tipo === "DELETE") {
                    exito = await this.eliminarCancion(cambio.cancion.id, false);
                }

                if (exito) {
                    this.cambiosPendientes = this.cambiosPendientes.filter(
                        c => c !== cambio
                    );
                    this.guardarCambiosPendientes();
                } else {
                    cambio.intentos = (cambio.intentos || 0) + 1;
                    this.guardarCambiosPendientes();
                }
            } catch (error) {
                console.error("❌ Error al sincronizar:", error);
                cambio.intentos = (cambio.intentos || 0) + 1;
                this.guardarCambiosPendientes();
            }
        }

        if (this.cambiosPendientes.length === 0) {
            console.log("✓ Todos los cambios sincronizados");
            this.cambiarEstado("sincronizado");
        } else {
            console.log("⚠️ Aún hay cambios pendientes:", this.cambiosPendientes.length);
            this.cambiarEstado("pendiente");
        }
    }

    // ========== GESTIÓN DE CONEXIÓN ==========

    configurarEventosConexion() {
        window.addEventListener("online", () => {
            console.log("📡 ¡Conexión recuperada!");
            this.tieneConexion = true;
            this.iniciarSesion();
            setTimeout(() => this.sincronizarCambiosPendientes(), 1000);
        });

        window.addEventListener("offline", () => {
            console.log("📡 Sin conexión");
            this.tieneConexion = false;
            this.cambiarEstado("pendiente");
        });
    }

    // ========== ESTADO DE SINCRONIZACIÓN ==========

    cambiarEstado(nuevoEstado) {
        this.estadoSincronizacion = nuevoEstado;
        this.notificarCambio(nuevoEstado);
    }

    notificarCambio(estado) {
        const evento = new CustomEvent("estadoSincronizacion", {
            detail: { estado }
        });
        document.dispatchEvent(evento);
    }

    obtenerEstado() {
        return this.estadoSincronizacion;
    }

    // ========== UTILIDADES ==========

    generarIdTemporal() {
        return -(Date.now() + Math.random());
    }

    obtenerCambiosPendientes() {
        return this.cambiosPendientes;
    }
}

// Instancia global del sincronizador
const sincronizador = new SincronizadorCancionero();
