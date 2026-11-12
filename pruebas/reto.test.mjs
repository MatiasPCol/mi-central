// Comprueba el banco de preguntas del Reto: cuatro opciones distintas y, en Python, que la respuesta sea la salida real.
// Uso: herramientas/node.sh --test pruebas/reto.test.mjs   (las de Python necesitan Python instalado; si no, se saltan)

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { PYTHON } from '../js/datos/reto-python.js';
import { INGLES } from '../js/datos/reto-ingles.js';

const python = ['python3', 'python', 'py'].find((c) => spawnSync(c, ['-c', 'print(1)'], { encoding: 'utf8' }).stdout?.trim() === '1');

/** @param {string} bien @param {string[]} mal @param {string} donde */
function opcionesSanas(bien, mal, donde) {
  assert.equal(mal.length, 3, `${donde}: deben ser 3 respuestas malas`);
  assert.equal(new Set([bien, ...mal]).size, 4, `${donde}: hay opciones repetidas`);
}

test('preguntas de Python bien armadas', () => {
  assert.ok(PYTHON.length >= 30);
  for (const p of PYTHON) {
    opcionesSanas(p.sale, p.mal, p.codigo);
    assert.ok([1, 2, 3].includes(p.n) && p.por.length > 20, p.codigo);
  }
  for (const n of [1, 2, 3]) assert.ok(PYTHON.filter((p) => p.n === n).length >= 8, `faltan preguntas de nivel ${n}`);
});

test('cada respuesta de Python es lo que el código imprime de verdad', { skip: python ? false : 'no hay Python instalado' }, () => {
  for (const p of PYTHON) {
    const r = spawnSync(/** @type {string} */ (python), ['-c', p.codigo], { encoding: 'utf8', timeout: 10000 });
    if (p.error) {
      assert.notEqual(r.status, 0, `debía fallar:\n${p.codigo}`);
      assert.match(r.stderr.trim().split('\n').pop() ?? '', new RegExp(`^${p.sale}\\b`), p.codigo);
    } else {
      assert.equal(r.status, 0, `falló:\n${p.codigo}\n${r.stderr}`);
      assert.equal(r.stdout.trim(), p.sale, p.codigo);
    }
  }
});

test('preguntas de inglés bien armadas', () => {
  assert.ok(INGLES.length >= 30);
  for (const p of INGLES) {
    opcionesSanas(p.bien, p.mal, p.pregunta);
    assert.ok([1, 2, 3].includes(p.n) && p.por.length > 20, p.pregunta);
  }
  for (const n of [1, 2, 3]) assert.ok(INGLES.filter((p) => p.n === n).length >= 8, `faltan preguntas de nivel ${n}`);
});
