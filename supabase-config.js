// Configuración de Supabase opcional para despliegues estáticos.
// En Vercel, usa variables de entorno o configura este archivo con tus credenciales reales
// sin subir secretos al repositorio.
const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";
const SUPABASE_EMAIL = "";
const SUPABASE_PASSWORD = "";

const SUPABASE_CONFIG_AVAILABLE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);