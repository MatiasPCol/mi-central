"""Servidor local para probar Mi Central en el computador.

Uso:  py herramientas/servidor.py
Abre: http://localhost:5173         (la app de verdad, hablando con el servidor real)
      http://localhost:5173/?demo   (datos inventados, sin tocar nada)
"""
import http.server
import os
import urllib.error
import urllib.request

PUERTO = 5173
SERVIDOR = "https://qzsyzrjdvdyyqtwhtktn.supabase.co/functions/v1/central"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Manejador(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, formato, *args):
        pass

    def _puente(self):
        largo = int(self.headers.get("Content-Length") or 0)
        cuerpo = self.rfile.read(largo) if largo else None
        cabeceras = {k: v for k, v in self.headers.items()
                     if k.lower() in ("content-type", "cookie", "origin", "x-mc", "user-agent")}
        pedido = urllib.request.Request(SERVIDOR + self.path, data=cuerpo, headers=cabeceras, method=self.command)
        try:
            respuesta = urllib.request.urlopen(pedido, timeout=40)
        except urllib.error.HTTPError as error:
            respuesta = error
        datos = respuesta.read()
        self.send_response(respuesta.status if hasattr(respuesta, "status") else respuesta.code)
        for nombre, valor in respuesta.headers.items():
            if nombre.lower() in ("content-type", "set-cookie") and "__cf_bm" not in valor:
                self.send_header(nombre, valor)
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self._puente()
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            return self._puente()
        self.send_error(405)


if __name__ == "__main__":
    print(f"Mi Central en http://localhost:{PUERTO}  (Ctrl+C para parar)")
    http.server.ThreadingHTTPServer(("127.0.0.1", PUERTO), Manejador).serve_forever()
