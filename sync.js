// 🔄 MÓDULO DE SINCRONIZACIÓN
// Gestiona: autenticación, INSERT/UPDATE/DELETE, cola de cambios, reintentos

class SincronizadorCancionero {
    constructor() {
        this.token = null;
        this.tieneConexion = navigator.onLine;
        this.estadoSincronizacion = "sincronizado"; // sincronizado, pendiente, error
        this.cambiosPendientes = [];
        this.intentosReintento = 0;
        this.maxReintentos = 5;

        this.cargarCambiosPendientes();
        this.configurarEventosConexion();
        this.iniciarSesion();
    }

    // ========== AUTENTICACIÓN ==========
    async iniciarSesion() {
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

    // ========== CRUD CON SUPABASE ==========

    async subirCancion(cancion) {
        if (!this.tieneConexion) {
            console.log("📡 Sin conexión - guardar en cola de pendientes");
            this.agregarCambioPendiente("INSERT", cancion);
            this.cambiarEstado("pendiente");
            return { id: this.generarIdTemporal() };
        }

        try {
            const token = this.obtenerToken();
            const respuesta = await fetch(`${SUPABASE_URL}/rest/v1/canciones`, {
                method: "POST",
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    Prefer: "return=representation"
                },
                body: JSON.stringify(cancion)
            });

            const datos = await respuesta.json();

            if (!respuesta.ok) {
                console.error("❌ Error al subir canción:", datos);
                this.agregarCambioPendiente("INSERT", cancion);
                this.cambiarEstado("error");
                return null;
            }

            console.log("✓ Canción subida a Supabase:", datos[0]);
            this.cambiarEstado("sincronizado");
            return datos[0];

        } catch (error) {
            console.error("❌ Error de conexión al subir:", error);
            this.agregarCambioPendiente("INSERT", cancion);
            this.cambiarEstado("pendiente");
            return null;
        }
    }

    async actualizarCancion(id, cancion) {
        if (!this.tieneConexion) {
            console.log("📡 Sin conexión - guardar en cola de pendientes");
            this.agregarCambioPendiente("UPDATE", { id, ...cancion });
            this.cambiarEstado("pendiente");
            return true;
        }

        try {
            const token = this.obtenerToken();
            const respuesta = await fetch(
                `${SUPABASE_URL}/rest/v1/canciones?id=eq.${id}`,
                {
                    method: "PATCH",
                    headers: {
                        apikey: SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(cancion)
                }
            );

            if (!respuesta.ok) {
                console.error("❌ Error al actualizar canción");
                this.agregarCambioPendiente("UPDATE", { id, ...cancion });
                this.cambiarEstado("error");
                return false;
            }

            console.log("✓ Canción actualizada en Supabase");
            this.cambiarEstado("sincronizado");
            return true;

        } catch (error) {
            console.error("❌ Error de conexión al actualizar:", error);
            this.agregarCambioPendiente("UPDATE", { id, ...cancion });
            this.cambiarEstado("pendiente");
            return false;
        }
    }

    async eliminarCancion(id) {
        if (!this.tieneConexion) {
            console.log("📡 Sin conexión - guardar en cola de pendientes");
            this.agregarCambioPendiente("DELETE", { id });
            this.cambiarEstado("pendiente");
            return true;
        }

        try {
            const token = this.obtenerToken();
            const respuesta = await fetch(
                `${SUPABASE_URL}/rest/v1/canciones?id=eq.${id}`,
                {
                    method: "DELETE",
                    headers: {
                        apikey: SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            if (!respuesta.ok) {
                console.error("❌ Error al eliminar canción");
                this.agregarCambioPendiente("DELETE", { id });
                this.cambiarEstado("error");
                return false;
            }

            console.log("✓ Canción eliminada de Supabase");
            this.cambiarEstado("sincronizado");
            return true;

        } catch (error) {
            console.error("❌ Error de conexión al eliminar:", error);
            this.agregarCambioPendiente("DELETE", { id });
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

        for (const cambio of this.cambiosPendientes) {
            if (cambio.intentos >= this.maxReintentos) {
                console.error("⚠️  Máximo de reintentos alcanzado para:", cambio);
                continue;
            }

            let exito = false;

            try {
                if (cambio.tipo === "INSERT") {
                    const resultado = await this.subirCancion(cambio.cancion);
                    exito = resultado !== null;
                } else if (cambio.tipo === "UPDATE") {
                    const { id, ...datos } = cambio.cancion;
                    exito = await this.actualizarCancion(id, datos);
                } else if (cambio.tipo === "DELETE") {
                    exito = await this.eliminarCancion(cambio.cancion.id);
                }

                if (exito) {
                    this.cambiosPendientes = this.cambiosPendientes.filter(
                        c => c.timestamp !== cambio.timestamp
                    );
                    this.guardarCambiosPendientes();
                }
            } catch (error) {
                console.error("❌ Error al sincronizar:", error);
                cambio.intentos++;
            }
        }

        if (this.cambiosPendientes.length === 0) {
            console.log("✓ Todos los cambios sincronizados");
            this.cambiarEstado("sincronizado");
        } else {
            console.log("⚠️  Aún hay cambios pendientes:", this.cambiosPendientes.length);
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
