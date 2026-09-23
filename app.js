// 📱 APLICACIÓN CANCIONERO
// Solo UI y flujo - sincronización delegada a sync.js

let canciones = [];
let idEditando = null;

// ========== INICIALIZACIÓN ==========

async function inicializar() {
    cargarCancionesLocales();
    configurarBuscador();
    configurarFormulario();
    configurarEventosSincronizacion();
    
    // Intenta cargar desde Supabase si hay conexión
    if (navigator.onLine) {
        await descargarCancionesDesdeSupabase();
    }
}

// ========== CARGA DE DATOS ==========

function cargarCancionesLocales() {
    const cancionesGuardadas = localStorage.getItem("canciones");
    
    if (cancionesGuardadas) {
        canciones = JSON.parse(cancionesGuardadas);
    } else {
        // Fallback a JSON local
        fetch("canciones.json")
            .then(r => r.json())
            .then(datos => {
                canciones = datos;
                guardarCancionesLocalmente();
            });
        return;
    }
    
    mostrarLista(canciones);
}

async function descargarCancionesDesdeSupabase() {
    try {
        const respuesta = await fetch(
            `${SUPABASE_URL}/rest/v1/canciones?select=*`,
            {
                headers: {
                    apikey: SUPABASE_ANON_KEY
                }
            }
        );

        if (!respuesta.ok) throw new Error("Error al descargar");

        const datos = await respuesta.json();
        canciones = datos;
        guardarCancionesLocalmente();
        mostrarLista(canciones);
        
        console.log("✓ Canciones descargadas desde Supabase");
    } catch (error) {
        console.error("Error descargando canciones:", error);
    }
}

function guardarCancionesLocalmente() {
    localStorage.setItem("canciones", JSON.stringify(canciones));
}

// ========== UI - LISTA DE CANCIONES ==========

function mostrarLista(cancionesAMostrar = canciones) {
    const lista = document.getElementById("lista-canciones");
    lista.innerHTML = "";

    if (cancionesAMostrar.length === 0) {
        lista.innerHTML = "<p class='sin-canciones'>No hay canciones</p>";
        return;
    }

    cancionesAMostrar.forEach(cancion => {
        const elemento = document.createElement("div");
        elemento.classList.add("tarjeta-cancion");
        elemento.dataset.id = cancion.id;

        elemento.innerHTML = `
            <h2>${cancion.titulo}</h2>
            <p>${cancion.artista}</p>
            <span class="etiqueta-categoria">${cancion.categoria}</span>
        `;

        elemento.addEventListener("click", () => mostrarCancion(cancion));
        lista.appendChild(elemento);
    });
}

// ========== UI - VER CANCIÓN ==========

function mostrarCancion(cancion) {
    const lista = document.getElementById("lista-canciones");

    document.getElementById("formulario-cancion").style.display = "none";
    document.getElementById("boton-agregar").style.display = "none";
    document.getElementById("buscador").style.display = "none";

    lista.innerHTML = `
        <div class="cabecera-cancion">
            <button class="boton-volver" onclick="volverALista()">← Volver</button>

            <div class="acciones-cancion">
                <button class="boton-editar" onclick="editarCancion(${cancion.id})">Editar</button>
                <button class="boton-eliminar" onclick="eliminarCancion(${cancion.id})">Eliminar</button>
            </div>
        </div>

        <div class="info-cancion">
            <h1>${cancion.titulo}</h1>
            <h2>${cancion.artista}</h2>
            <span class="etiqueta-categoria">${cancion.categoria}</span>
        </div>

        <pre>${cancion.letra}</pre>
    `;
}

// ========== UI - VOLVER A LISTA ==========

function volverALista() {
    document.getElementById("form-cancion").reset();
    document.getElementById("formulario-cancion").style.display = "none";
    document.getElementById("boton-agregar").style.display = "block";
    document.getElementById("buscador").style.display = "block";

    document.getElementById("titulo-formulario").textContent = "Agregar canción";
    document.getElementById("boton-guardar").textContent = "Agregar canción";

    idEditando = null;
    mostrarLista(canciones);
}

// ========== UI - FORMULARIO ==========

function mostrarFormularioAgregar() {
    idEditando = null;
    document.getElementById("form-cancion").reset();
    document.getElementById("titulo-formulario").textContent = "Agregar canción";
    document.getElementById("boton-guardar").textContent = "Agregar canción";
    document.getElementById("formulario-cancion").style.display = "block";
    document.getElementById("formulario-cancion").scrollIntoView({ behavior: "smooth" });
}

function configurarFormulario() {
    document.getElementById("form-cancion").addEventListener("submit", async (evento) => {
        evento.preventDefault();

        const titulo = document.getElementById("titulo").value;
        const artista = document.getElementById("artista").value;
        const categoria = document.getElementById("categoria").value;
        const letra = document.getElementById("letra").value;

        if (!titulo || !artista || !categoria || !letra) {
            alert("Completa todos los campos");
            return;
        }

        const cancion = { titulo, artista, categoria, letra };

        if (idEditando !== null) {
            // ========== EDITAR ==========
            const cancionEditada = canciones.find(c => c.id === idEditando);
            Object.assign(cancionEditada, cancion);
            
            // Sincronizar con Supabase
            const exito = await sincronizador.actualizarCancion(idEditando, cancion);
            
            if (!exito) {
                alert("⚠️  Cambio guardado localmente pero no se sincronizó aún");
            } else {
                alert("✓ Canción modificada correctamente");
            }

        } else {
            // ========== AGREGAR ==========
            // Sincronizar con Supabase primero
            const cancionSupabase = await sincronizador.subirCancion(cancion);
            
            if (cancionSupabase) {
                cancion.id = cancionSupabase.id;
                canciones.push(cancion);
                alert("✓ Canción agregada correctamente");
            } else {
                cancion.id = sincronizador.generarIdTemporal();
                canciones.push(cancion);
                alert("⚠️  Canción guardada localmente pero no se sincronizó aún");
            }
        }

        guardarCancionesLocalmente();

        document.getElementById("form-cancion").reset();
        document.getElementById("formulario-cancion").style.display = "none";
        document.getElementById("boton-agregar").style.display = "block";
        document.getElementById("buscador").style.display = "block";

        document.getElementById("titulo-formulario").textContent = "Agregar canción";
        document.getElementById("boton-guardar").textContent = "Agregar canción";

        idEditando = null;
        mostrarLista(canciones);
    });

    document.getElementById("boton-agregar").addEventListener("click", mostrarFormularioAgregar);
}

// ========== EDITAR ==========

function editarCancion(id) {
    const cancion = canciones.find(c => c.id === id);
    if (!cancion) return;

    idEditando = id;

    document.getElementById("titulo").value = cancion.titulo;
    document.getElementById("artista").value = cancion.artista;
    document.getElementById("categoria").value = cancion.categoria;
    document.getElementById("letra").value = cancion.letra;

    document.getElementById("titulo-formulario").textContent = "Modificar canción";
    document.getElementById("boton-guardar").textContent = "Guardar cambios";

    document.getElementById("formulario-cancion").style.display = "block";
    document.getElementById("boton-agregar").style.display = "none";

    document.getElementById("formulario-cancion").scrollIntoView({ behavior: "smooth" });
}

// ========== ELIMINAR ==========

async function eliminarCancion(id) {
    const confirmar = confirm("¿Querés eliminar esta canción?");
    if (!confirmar) return;

    const exito = await sincronizador.eliminarCancion(id);

    canciones = canciones.filter(c => c.id !== id);
    guardarCancionesLocalmente();

    document.getElementById("boton-agregar").style.display = "block";
    document.getElementById("buscador").style.display = "block";

    if (!exito) {
        alert("⚠️  Canción eliminada localmente pero no se sincronizó aún");
    } else {
        alert("✓ Canción eliminada correctamente");
    }

    mostrarLista(canciones);
}

// ========== BUSCADOR ==========

function configurarBuscador() {
    const buscador = document.getElementById("buscador");

    buscador.addEventListener("input", function () {
        const texto = buscador.value.toLowerCase();

        const resultados = canciones.filter(cancion =>
            cancion.titulo.toLowerCase().includes(texto) ||
            cancion.artista.toLowerCase().includes(texto)
        );

        mostrarLista(resultados);
    });
}

// ========== SINCRONIZACIÓN - INDICADOR DE ESTADO ==========

function configurarEventosSincronizacion() {
    document.addEventListener("estadoSincronizacion", (evento) => {
        const estado = evento.detail.estado;
        actualizarIndicadorEstado(estado);
    });

    // Verificar estado inicial
    actualizarIndicadorEstado(sincronizador.obtenerEstado());
}

function actualizarIndicadorEstado(estado) {
    const indicador = document.getElementById("estado-sincronizacion");
    if (!indicador) return;

    let icon = "";
    let texto = "";
    let clase = "";

    switch (estado) {
        case "sincronizado":
            icon = "✓";
            texto = "Sincronizado";
            clase = "sincronizado";
            break;
        case "pendiente":
            icon = "↻";
            texto = "Pendiente";
            clase = "pendiente";
            break;
        case "error":
            icon = "⚠";
            texto = "Error";
            clase = "error";
            break;
    }

    indicador.innerHTML = `<span class="icono-estado ${clase}">${icon}</span> ${texto}`;
}

// ========== INIT ==========

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
}

inicializar();
