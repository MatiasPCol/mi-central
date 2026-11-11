"""Dibuja los iconos de Mi Central (un anillo con un punto en el centro). Uso: py herramientas/iconos.py"""
import os
import struct
import zlib

import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERDE = np.array([52, 211, 153], dtype=float)
OSCURO = np.array([15, 18, 24], dtype=float)


def guardar_png(ruta, rgba):
    alto, ancho, _ = rgba.shape
    crudo = b"".join(b"\x00" + rgba[y].tobytes() for y in range(alto))

    def trozo(tipo, datos):
        return struct.pack(">I", len(datos)) + tipo + datos + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)

    with open(ruta, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 6, 0, 0, 0))
                + trozo(b"IDAT", zlib.compress(crudo, 9)) + trozo(b"IEND", b""))


def dibujar(lado, margen=0.0, redondeo=0.24, solo_marca=False):
    s = 4  # suavizado
    n = lado * s
    y, x = (np.mgrid[0:n, 0:n] + 0.5) / n - 0.5
    r = np.hypot(x, y)
    escala = 1 - 2 * margen
    anillo = (np.abs(r - 0.26 * escala) < 0.055 * escala) | (r < 0.095 * escala)
    if solo_marca:
        color = np.ones((n, n, 3)) * 255
        alfa = anillo.astype(float)
    else:
        q = np.maximum(np.abs(x), np.abs(y))
        esquina = np.hypot(np.maximum(np.abs(x) - (0.5 - redondeo), 0), np.maximum(np.abs(y) - (0.5 - redondeo), 0))
        fondo = (q <= 0.5) & (esquina <= redondeo) if redondeo > 0 else np.ones((n, n), bool)
        color = np.where(anillo[..., None], OSCURO, VERDE * (1.06 - 0.22 * (y[..., None] + 0.5)))
        alfa = fondo.astype(float)
    rgba = np.dstack([np.clip(color, 0, 255), alfa * 255]).reshape(lado, s, lado, s, 4).mean(axis=(1, 3))
    return rgba.round().astype(np.uint8)


guardar_png(os.path.join(RAIZ, "iconos", "icono-192.png"), dibujar(192))
guardar_png(os.path.join(RAIZ, "iconos", "icono-512.png"), dibujar(512))
guardar_png(os.path.join(RAIZ, "iconos", "icono-maskable-512.png"), dibujar(512, margen=0.14, redondeo=0))
guardar_png(os.path.join(RAIZ, "iconos", "insignia-96.png"), dibujar(96, solo_marca=True))
print("iconos listos")
