# Mi Central

App personal y privada de Matias: tareas, notas, metas a futuro, materias con sus notas y todos sus datos.
Se instala en el celular, funciona sin conexión y avisa de cada cambio.

## Cómo está armada

- **La app** (esta carpeta): HTML, CSS y JavaScript sin compilar. Vercel la publica tal cual.
- **El servidor**: una función de Supabase (`supabase/functions/central`) en el proyecto "Dobla Ya".
- **Los datos**: tablas del esquema `central` en ese mismo proyecto. La API pública de Supabase no las ve.
- **`vercel.json`** manda todo lo que empieza por `/api/` a la función de Supabase.

## Quién puede entrar

Solo dispositivos vinculados. Cada uno guarda una llave que no se puede copiar y, si quiere, pide la huella.
Para vincular hace falta un código de un solo uso que da un dispositivo ya vinculado (Ajustes) o Claude:

```sql
select central.crear_codigo_vinculo('Claude', 60);
```

Desvincular un dispositivo le quita el acceso al instante y borra sus datos locales.

## Avisos

- Notificación al celular en cada cambio. Las ediciones seguidas se juntan en un solo aviso.
- Recordatorios de tareas, resumen diario y respaldo semanal. Los dispara `central.tic()`, que corre cada minuto.
- Correo a Gmail y Google Calendar con `puente-google/Codigo.gs`, que se instala desde Ajustes.

## Probar en el computador

```bash
py herramientas/servidor.py
```

Abre `http://localhost:5173/?demo` para ver la app con datos inventados.

Pruebas del servidor, sin instalar Node (usa el motor de VS Code):

```bash
bash herramientas/node.sh --test pruebas/cripto.test.mjs
```

## Carpetas

- `js/vistas`: una pantalla por archivo. `js/datos`: datos, guardado local y sincronización.
- `js/seguridad`: vinculación y huella. `js/calculo`: el cálculo de "¿gano el año?".
- `supabase/migraciones`: las tablas y funciones, en el orden en que se aplicaron.
- `pruebas`: celulares simulados que prueban el servidor de punta a punta.
