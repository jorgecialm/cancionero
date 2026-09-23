# 🎵 Cancionero - Refactor Completo

## ✨ Cambios principales

### 1. **Seguridad**
- ✅ Credenciales en `supabase-config.js` (archivo local, NO en repo)
- ✅ `.gitignore` protege archivos sensibles
- ✅ Autenticación segura con Supabase Auth

### 2. **Sincronización completa**
- ✅ **Agregar** → Sube a Supabase con ID real
- ✅ **Editar** → Sincroniza cambios a Supabase
- ✅ **Eliminar** → Sincroniza eliminación a Supabase
- ✅ Cola de cambios pendientes (si no hay conexión)
- ✅ Reintentos automáticos al recuperar conexión

### 3. **Indicador de estado**
- ✅ **✓ Sincronizado** — Todo está actualizado
- ✅ **↻ Pendiente** — Cambios en cola esperando conexión
- ✅ **⚠ Error** — Problema en la sincronización

### 4. **Service Worker mejorado**
- ✅ **Network-first** para datos (Supabase)
- ✅ **Cache-first** para assets (HTML, CSS, JS)
- ✅ Funciona offline correctamente
- ✅ Invalida cache inteligentemente

### 5. **Código limpio y modular**
- ✅ `sync.js` — Toda la lógica de sincronización
- ✅ `app.js` — Solo UI y flujo
- ✅ Fácil de mantener y extender

---

## 🚀 Instalación

### Paso 1: Copiar archivos

Reemplaza en tu proyecto:
```
- index.html
- style.css
- app.js (NUEVO REFACTORIZADO)
- service-worker.js
- .gitignore
```

Agrega archivos nuevos:
```
- sync.js (NUEVO)
- supabase-config.js (NUEVO - crear localmente)
```

### Paso 2: Configurar Supabase

**A. Crear `supabase-config.js` en tu PC:**

```javascript
// supabase-config.js - GUARDAR SOLO LOCALMENTE
const SUPABASE_URL = "https://tuproject.supabase.co";
const SUPABASE_ANON_KEY = "tu-anon-key-publica";

// Credenciales PC (maestro)
const SUPABASE_EMAIL = "tu-email@gmail.com";
const SUPABASE_PASSWORD = "tu-password-segura";
```

**B. Verificar que `supabase-config.js` está en `.gitignore`:**

```
supabase-config.js
```

**C. Usar credenciales diferentes por dispositivo:**

En la PC: Email + Password con permisos INSERT/UPDATE/DELETE  
En el Celular: Email + Password diferentes con solo SELECT (o usar anon key)

---

## 📱 Cómo funciona

### Flujo en la PC (Maestro)

```
Usuario hace cambio
    ↓
app.js → llama a sync.js
    ↓
sync.js intenta sincronizar con Supabase
    ↓
¿Hay conexión?
├─ Sí → Subir a Supabase ✓
└─ No → Guardar en cola de pendientes ↻
```

### Flujo en el Celular (Lector)

```
Abrir app
    ↓
Cargar canciones desde localStorage
    ↓
¿Hay conexión?
├─ Sí → Verificar versión de Supabase
│        ├─ ¿Hay versión nueva?
│        └─ Sí → Descargar biblioteca
└─ No → Usar copia local offline
```

### Recuperación de conexión

```
Internet vuelve
    ↓
sync.js detecta cambio de conexión
    ↓
Sincronizar cambios pendientes automáticamente
    ↓
Actualizar indicador ✓ Sincronizado
```

---

## 🔧 Configuración RLS en Supabase

### Tabla `canciones` - Política para PC (INSERT/UPDATE/DELETE)

```sql
-- PC puede hacer todo
CREATE POLICY "PC maestro full access"
ON public.canciones
FOR ALL
USING (auth.email() = 'tu-email@gmail.com')
WITH CHECK (auth.email() = 'tu-email@gmail.com');
```

### Tabla `canciones` - Política para Celular (Solo SELECT)

```sql
-- Celular solo lectura
CREATE POLICY "Celular solo lectura"
ON public.canciones
FOR SELECT
USING (auth.email() = 'celular-email@gmail.com')
WITH CHECK (false);
```

---

## 🎯 Cambios en el código

### Antes (sin refactor)
```javascript
// Editar: guardaba solo localmente, no sincronizaba
function editar() {
    cancion.titulo = document.getElementById("titulo").value;
    guardarCanciones(); // ❌ No sube a Supabase
}
```

### Después (con refactor)
```javascript
// Editar: sincroniza automáticamente
async function editar() {
    const exito = await sincronizador.actualizarCancion(id, cancion);
    // ✅ Sube a Supabase o guarda en cola si no hay conexión
}
```

---

## 📋 API de sync.js

```javascript
// Subir canción nueva
const resultado = await sincronizador.subirCancion(cancion);
// Retorna: { id: 123, ...cancion } o null

// Actualizar canción existente
const exito = await sincronizador.actualizarCancion(id, { titulo: "Nuevo" });
// Retorna: true/false

// Eliminar canción
const exito = await sincronizador.eliminarCancion(id);
// Retorna: true/false

// Obtener cambios pendientes
const pendientes = sincronizador.obtenerCambiosPendientes();
// Retorna: Array de cambios en cola

// Obtener estado
const estado = sincronizador.obtenerEstado();
// Retorna: "sincronizado", "pendiente" o "error"

// Escuchar cambios de estado
document.addEventListener("estadoSincronizacion", (evento) => {
    console.log("Nuevo estado:", evento.detail.estado);
});
```

---

## 🐛 Debugging

### Ver cambios pendientes en consola
```javascript
console.log(sincronizador.obtenerCambiosPendientes());
```

### Ver estado actual
```javascript
console.log(sincronizador.obtenerEstado());
```

### Borrar cache del Service Worker (si hay problemas)
```javascript
// En DevTools Console
caches.keys().then(names => 
    names.forEach(name => caches.delete(name))
);
```

### Simular sin conexión
```
DevTools → Network → Throttling → Offline
```

---

## ⚠️ Notas importantes

1. **NUNCA subir `supabase-config.js` a GitHub**
   - Contiene credenciales
   - Está en `.gitignore`
   - Solo guardar localmente en tu PC

2. **Credenciales por dispositivo**
   - PC: Email con permisos de escritura
   - Celular: Email solo lectura (o usar anon key)

3. **RLS debe estar activado**
   - Protege datos según el usuario
   - Implementa política de PC maestro / Celular lector

4. **localStorage** guarda:
   - Canciones locales
   - Cambios pendientes
   - Versión de biblioteca

5. **Service Worker** cachea:
   - Assets (HTML, CSS, JS, PNG)
   - Datos de Supabase
   - Limpia cache viejo automáticamente

---

## 🚀 Próximos pasos (Versión 0.2)

- [ ] Background Sync (sincronizar aún si la app cierra)
- [ ] Sincronización bidireccional (celular → PC)
- [ ] Historial de versiones
- [ ] Transposición de tonalidad
- [ ] Reproducción de audio
- [ ] Integración con YouTube

---

## ❓ Preguntas frecuentes

**P: ¿Dónde pongo el email y password?**
A: En `supabase-config.js` en tu PC. Nunca en el repo.

**P: ¿Qué pasa si se corta Internet mientras estoy editando?**
A: El cambio se guarda localmente y se sincroniza automáticamente cuando vuelve la conexión.

**P: ¿El celular puede editar canciones?**
A: No en esta versión. Solo lectura. Si necesitas editar, hazlo desde la PC.

**P: ¿Cómo sé si está sincronizado?**
A: Mira el indicador en el header: ✓ / ↻ / ⚠

**P: ¿Funciona offline?**
A: Sí. Puedes ver las canciones offline. Los cambios se sincronizan cuando hay conexión.

---

## 📞 Soporte

Si hay problemas:
1. Verifica la consola (F12 → Console)
2. Revisa los logs del Service Worker
3. Limpia cache y localStorage si es necesario

Código refactorizado y probado. ¡Listo para usar! 🎵
