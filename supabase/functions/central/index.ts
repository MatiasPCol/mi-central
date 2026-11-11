// Entrada del servidor de Mi Central en Supabase (Edge Function "central").
import postgres from 'npm:postgres@3.4.5';
import { crearServidor } from './servidor.js';
import { crearIA } from './ia.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 2, prepare: false, idle_timeout: 20, connect_timeout: 10 });

// Sin la llave, la app avisa que la IA no está configurada y todo lo demás sigue igual.
const llaveIA = Deno.env.get('ANTHROPIC_API_KEY');

const manejar = crearServidor({
  bd: { consulta: (texto: string, parametros: unknown[] = []) => sql.unsafe(texto, parametros as never[]) as unknown as Promise<any[]> },
  prefijo: '/central',
  ia: llaveIA ? crearIA(llaveIA) : undefined,
  enSegundoPlano: (p: Promise<unknown>) => {
    const tarea = p.catch((e) => console.error('segundo plano:', e?.message ?? e));
    (globalThis as any).EdgeRuntime?.waitUntil?.(tarea);
  },
  // Un toque a la API pública para que Supabase vea actividad y no pause el proyecto.
  mantenerVivo: async () => {
    const url = Deno.env.get('SUPABASE_URL');
    const llave = Deno.env.get('SUPABASE_ANON_KEY');
    if (url && llave) await fetch(`${url}/rest/v1/`, { headers: { apikey: llave } }).then((r) => r.arrayBuffer());
  },
});

Deno.serve((req) => manejar(req));
