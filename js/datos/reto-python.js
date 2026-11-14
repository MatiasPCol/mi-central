// Preguntas del Reto: "¿qué imprime este código?". n es el nivel (1 a 3).
// "sale" es la salida real; si error es true, el código termina con ese error.
// pruebas/reto.test.mjs corre cada pedazo con Python y comprueba que "sale" sea verdad.

/** @typedef {{ n: number, codigo: string, sale: string, mal: string[], por: string, error?: boolean }} PreguntaPython */

/** @type {PreguntaPython[]} */
export const PYTHON = [
  // ---------- Nivel 1 ----------
  { n: 1, codigo: `x = [1, 2, 3]
y = x
y.append(4)
print(len(x))`, sale: '4', mal: ['3', '5', 'Error'],
    por: 'y = x no copia la lista: los dos nombres apuntan a la misma. Lo que le agregas a y también está en x.' },
  { n: 1, codigo: `print(7 // 2, -7 // 2)`, sale: '3 -4', mal: ['3 -3', '3.5 -3.5', '4 -4'],
    por: '// redondea hacia abajo, no hacia cero. -3.5 hacia abajo es -4.' },
  { n: 1, codigo: `print("ab" * 2 + "c")`, sale: 'ababc', mal: ['abc2', 'ab2c', 'Error'],
    por: 'Un texto por un número lo repite. Primero va la multiplicación y luego la suma.' },
  { n: 1, codigo: `s = "python"
print(s[1:4])`, sale: 'yth', mal: ['pyt', 'ytho', 'yt'],
    por: 'El corte empieza en la posición 1 (la y) y llega hasta la 4 sin incluirla.' },
  { n: 1, codigo: `print(10 % 3, -10 % 3)`, sale: '1 2', mal: ['1 -1', '1 1', '3 -3'],
    por: 'En Python el residuo toma el signo del divisor: -10 = 3 × (-4) + 2.' },
  { n: 1, codigo: `a = [3, 1, 2]
b = a.sort()
print(b)`, sale: 'None', mal: ['[1, 2, 3]', '[3, 1, 2]', 'Error'],
    por: 'sort() ordena la lista en su sitio y no devuelve nada (None). La que sí devuelve una lista nueva es sorted().' },
  { n: 1, codigo: `print(bool(""), bool(" "), bool("0"))`, sale: 'False True True', mal: ['False False False', 'False True False', 'True True True'],
    por: 'Solo el texto vacío es falso. Un espacio o un "0" ya son texto con algo adentro.' },
  { n: 1, codigo: `x = 5
def f():
    x = 10
f()
print(x)`, sale: '5', mal: ['10', 'None', 'Error'],
    por: 'La x de adentro de la función es otra variable, local. La de afuera no se toca.' },
  { n: 1, codigo: `print(type(1 / 1).__name__, 2 ** 3 ** 2)`, sale: 'float 512', mal: ['int 64', 'float 64', 'int 512'],
    por: '/ siempre da float. Y ** se agrupa de derecha a izquierda: 3 ** 2 = 9 y luego 2 ** 9 = 512.' },
  { n: 1, codigo: `n = [1, 2, 3, 4, 5]
print(n[-2:], n[::2])`, sale: '[4, 5] [1, 3, 5]', mal: ['[4] [1, 3, 5]', '[4, 5] [2, 4]', '[3, 4] [1, 3, 5]'],
    por: '[-2:] son los dos últimos. [::2] va de dos en dos empezando por el primero.' },
  { n: 1, codigo: `print("5" + "5", 5 + 5, "5" * 2)`, sale: '55 10 55', mal: ['10 10 10', '55 10 10', 'Error'],
    por: 'Con textos, + pega y * repite. Solo con números suma.' },
  { n: 1, codigo: `for i in range(1, 10, 3):
    print(i, end=" ")`, sale: '1 4 7', mal: ['1 4 7 10', '1 3 6 9', '0 3 6 9'],
    por: 'range(1, 10, 3) arranca en 1, salta de 3 en 3 y para antes de llegar a 10.' },

  // ---------- Nivel 2 ----------
  { n: 2, codigo: `def f(x, lista=[]):
    lista.append(x)
    return lista
f(1)
print(f(2))`, sale: '[1, 2]', mal: ['[2]', '[1]', 'Error'],
    por: 'El valor por defecto [] se crea una sola vez, al definir la función. Todas las llamadas comparten esa misma lista.' },
  { n: 2, codigo: `a = [[0] * 2] * 2
a[0][0] = 9
print(a)`, sale: '[[9, 0], [9, 0]]', mal: ['[[9, 0], [0, 0]]', '[[9, 9], [9, 9]]', '[[9, 0]]'],
    por: '* 2 no copia la lista de adentro: pone dos veces la misma. Cambias una y "cambian" las dos.' },
  { n: 2, codigo: `print(0.1 + 0.2 == 0.3, round(2.5), round(3.5))`, sale: 'False 2 4', mal: ['True 3 4', 'False 3 4', 'True 2 4'],
    por: 'Los decimales no son exactos (0.1 + 0.2 da 0.30000000000000004). Y round lleva los .5 al número par más cercano.' },
  { n: 2, codigo: `x = "a,b,,c".split(",")
print(len(x), x[2] == "")`, sale: '4 True', mal: ['3 False', '3 True', '4 False'],
    por: 'Entre las dos comas seguidas queda un texto vacío, y split lo cuenta como un elemento.' },
  { n: 2, codigo: `print(1 < 3 < 2, 1 < 3 > 2)`, sale: 'False True', mal: ['True True', 'False False', 'Error'],
    por: 'Las comparaciones encadenadas se leen como "1 < 3 y 3 < 2" y "1 < 3 y 3 > 2".' },
  { n: 2, codigo: `d = {"a": 1}
d["b"] = d.get("c", 0) + 1
d["a"] += d["b"]
print(d)`, sale: "{'a': 2, 'b': 1}", mal: ["{'a': 1, 'b': 1}", "{'a': 2, 'b': 1, 'c': 0}", 'Error'],
    por: 'get("c", 0) devuelve 0 porque "c" no existe, pero no la crea en el diccionario.' },
  { n: 2, codigo: `a, *b, c = "hola!"
print(b, c)`, sale: "['o', 'l', 'a'] !", mal: ['ola !', "['o', 'l'] a", 'Error'],
    por: 'a toma la primera letra, c la última, y *b recoge todo lo del medio como lista.' },
  { n: 2, codigo: `print([x * 2 for x in range(5) if x % 2])`, sale: '[2, 6]', mal: ['[0, 4, 8]', '[1, 3]', '[2, 4, 6, 8]'],
    por: 'x % 2 es verdadero solo en los impares (1 y 3). Esos son los que se duplican.' },
  { n: 2, codigo: `print(0 or "x", 1 and 0, [] or None, "a" and "b")`, sale: 'x 0 None b', mal: ['True False False True', 'x 1 None a', '0 0 [] b'],
    por: 'or y and no devuelven True o False: devuelven uno de los dos valores. or el primero verdadero (o el último); and el primero falso (o el último).' },
  { n: 2, codigo: `t = (1, [2, 3])
t[1].append(4)
print(t)`, sale: '(1, [2, 3, 4])', mal: ['Error', '(1, [2, 3])', '(1, [2, 3], 4)'],
    por: 'La tupla no se puede cambiar, pero la lista que lleva adentro sí. La tupla sigue apuntando a la misma lista.' },
  { n: 2, codigo: `s = {3, 1, 2, 3, 1}
print(len(s), sum(s))`, sale: '3 6', mal: ['5 10', '3 10', '2 6'],
    por: 'Un conjunto no guarda repetidos: queda {1, 2, 3}.' },
  { n: 2, codigo: `def f(n):
    if n < 2:
        return n
    return f(n - 1) + f(n - 2)
print(f(7))`, sale: '13', mal: ['8', '21', '11'],
    por: 'Es Fibonacci: 0, 1, 1, 2, 3, 5, 8, 13. El de la posición 7 es 13.' },
  { n: 2, codigo: `x = [1, 2, 3]
for i in x:
    if i == 2:
        x.remove(i)
print(x, i)`, sale: '[1, 3] 2', mal: ['[1, 3] 3', '[1, 2, 3] 3', 'Error'],
    por: 'Al quitar el 2 la lista se corre, y el for cree que ya llegó al final: nunca visita el 3.' },
  { n: 2, codigo: `print("Hola Mundo".swapcase()[::-1][:5])`, sale: 'ODNUm', mal: ['hOLA ', 'odnuM', 'ODNUM'],
    por: 'swapcase da "hOLA mUNDO", [::-1] lo voltea a "ODNUm ALOh" y [:5] toma las cinco primeras.' },
  { n: 2, codigo: `print(sorted(["b", "A", "c", "B"]), max("zebra", "Zulu"))`, sale: "['A', 'B', 'b', 'c'] zebra", mal: ["['A', 'b', 'B', 'c'] zebra", "['A', 'B', 'b', 'c'] Zulu", "['b', 'c', 'A', 'B'] Zulu"],
    por: 'Al comparar textos, todas las mayúsculas van antes que las minúsculas.' },
  { n: 2, codigo: `a = [1]
b = a
b += [2]
print(a, b)`, sale: '[1, 2] [1, 2]', mal: ['[1] [1, 2]', '[1] [1]', 'Error'],
    por: 'En listas, += modifica la misma lista (no crea otra), y a y b son la misma.' },

  // ---------- Nivel 3 ----------
  { n: 3, codigo: `f = [lambda: i for i in range(3)]
print([g() for g in f])`, sale: '[2, 2, 2]', mal: ['[0, 1, 2]', '[3, 3, 3]', 'Error'],
    por: 'Las tres funciones miran la misma variable i, y cuando por fin se llaman, i ya quedó en 2.' },
  { n: 3, codigo: `def f():
    try:
        return "a"
    finally:
        print("b", end="")
print(f())`, sale: 'ba', mal: ['ab', 'a', 'b'],
    por: 'finally corre siempre, incluso con un return en el try: se imprime b antes de que el valor "a" salga de la función.' },
  { n: 3, codigo: `g = (x * x for x in range(4))
print(sum(g), sum(g))`, sale: '14 0', mal: ['14 14', '6 6', 'Error'],
    por: 'Un generador se gasta: el primer sum lo recorre entero y al segundo ya no le queda nada.' },
  { n: 3, codigo: `print(True + True * 3, isinstance(True, int), "1" == 1)`, sale: '4 True False', mal: ['6 True False', '4 False False', 'Error'],
    por: 'True vale 1 (bool es un tipo de int): 1 + 1 × 3 = 4. Y un texto nunca es igual a un número.' },
  { n: 3, codigo: `x = 10
def f():
    print(x)
    x = 5
f()`, sale: 'UnboundLocalError', error: true, mal: ['10', '5', 'NameError'],
    por: 'Como la función asigna x en algún punto, Python trata x como local en toda la función. El print la usa antes de que tenga valor.' },
  { n: 3, codigo: `a = [1, 2, 3]
b = a[:]
b[0] = 9
c = a
c[1] = 8
print(a, b)`, sale: '[1, 8, 3] [9, 2, 3]', mal: ['[9, 8, 3] [9, 8, 3]', '[1, 2, 3] [9, 2, 3]', '[1, 8, 3] [9, 8, 3]'],
    por: 'a[:] sí hace una copia (b va por su lado). c = a no copia: es la misma lista.' },
  { n: 3, codigo: `d = {}
d[1] = "a"
d[1.0] = "b"
d[True] = "c"
print(d)`, sale: "{1: 'c'}", mal: ["{1: 'a', 1.0: 'b', True: 'c'}", "{True: 'c'}", "{1: 'a'}"],
    por: '1, 1.0 y True son iguales y tienen el mismo hash, así que son la misma llave. Se queda la primera llave y el último valor.' },
  { n: 3, codigo: `def cont():
    n = 0
    def mas():
        nonlocal n
        n += 1
        return n
    return mas
c = cont()
c(); c()
print(c(), cont()())`, sale: '3 1', mal: ['3 4', '1 1', '3 3'],
    por: 'Cada llamada a cont() crea su propia n. c ya contó hasta 3; el contador nuevo apenas va en 1.' },
  { n: 3, codigo: `print("a" in "abc" in ["abc"], not 1 == 2 or 0)`, sale: 'True True', mal: ['False True', 'True 0', 'Error'],
    por: 'in también se encadena: "a" in "abc" y "abc" in ["abc"]. Y not se aplica a (1 == 2) antes del or.' },
  { n: 3, codigo: `x = [1, 2, 3, 4]
print(x[1:3] == x[-3:-1], x[10:], x[::-2])`, sale: 'True [] [4, 2]', mal: ['True Error [4, 2]', 'False [] [4, 2]', 'True [] [3, 1]'],
    por: 'Los dos primeros cortes dan [2, 3]. Un corte fuera de rango no falla, da lista vacía. Y [::-2] va hacia atrás desde el final.' },
  { n: 3, codigo: `a = 256
b = int("256")
c = [1, 2]
d = [1, 2]
print(a == b, c == d, c is d)`, sale: 'True True False', mal: ['True True True', 'True False False', 'False True False'],
    por: '== compara el contenido; is pregunta si son el mismo objeto. Dos listas iguales siguen siendo dos listas distintas.' },
  { n: 3, codigo: `print(list(zip("abc", [1, 2])), dict(zip("ab", "cd")))`, sale: "[('a', 1), ('b', 2)] {'a': 'c', 'b': 'd'}", mal: ["[('a', 1), ('b', 2), ('c', None)] {'a': 'c', 'b': 'd'}", "[('a', 1), ('b', 2)] {'ab': 'cd'}", 'Error'],
    por: 'zip empareja uno a uno y para cuando se acaba el más corto: la "c" se queda sin pareja y no sale.' },
  { n: 3, codigo: `class A:
    n = []
    def __init__(self):
        self.n.append(1)
a, b = A(), A()
print(len(b.n), a.n is b.n)`, sale: '2 True', mal: ['1 False', '1 True', '2 False'],
    por: 'n está definida en la clase, no en cada objeto: todos los A comparten la misma lista.' },
  { n: 3, codigo: `print(sorted([3, -5, 2, -1], key=abs)[1:3], sum(range(1, 6)) // 4)`, sale: '[2, 3] 3', mal: ['[-1, 2] 3', '[2, 3] 3.75', '[3, -5] 3'],
    por: 'Ordenado por valor absoluto queda [-1, 2, 3, -5]; el corte toma el 2 y el 3. Y 15 // 4 es 3.' },
  { n: 3, codigo: `s = "mississippi"
print(s.count("ss"), s.find("ss", 3), s.replace("ss", "S", 1))`, sale: '2 5 miSissippi', mal: ['2 2 miSissippi', '2 5 miSiSippi', '4 5 miSissippi'],
    por: 'Hay dos "ss". Buscando desde la posición 3, la siguiente empieza en la 5. Y el 1 de replace cambia solo la primera.' },
  { n: 3, codigo: `def f(a, b=2, *c, d=4, **e):
    return a + b + len(c) + d + len(e)
print(f(1, 3, 5, 7, d=0, z=9))`, sale: '7', mal: ['8', '11', 'Error'],
    por: 'a=1, b=3, c=(5, 7), d=0 y e={"z": 9}. Entonces 1 + 3 + 2 + 0 + 1 = 7.' },
];
