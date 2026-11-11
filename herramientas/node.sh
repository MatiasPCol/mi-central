#!/usr/bin/env bash
# Corre JavaScript con el motor que trae VS Code, sin instalar Node.
# Uso: herramientas/node.sh --test pruebas/
ELECTRON_RUN_AS_NODE=1 exec "$LOCALAPPDATA/Programs/Microsoft VS Code/Code.exe" "$@"
