/**
 * Puente de Google para Mi Central.
 * Corre dentro de TU cuenta de Google. Cada 5 minutos le pregunta a Mi Central si hay
 * correos por enviar a tu Gmail o tareas por poner en tu calendario, y lo hace.
 *
 * Instalar: pega este archivo en script.new, elige la función "instalar" y toca Ejecutar.
 * Quitar: ejecuta "desinstalar".
 */

var URL_CENTRAL = '__URL__';
var SECRETO = '__SECRETO__';
var CALENDARIO = 'Mi Central';

function instalar() {
  desinstalar();
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(5).create();
  calendario_();
  sincronizar();
  Logger.log('Listo. Mi Central ya puede enviarte correos y usar tu calendario.');
}

function desinstalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

function calendario_() {
  var lista = CalendarApp.getOwnedCalendarsByName(CALENDARIO);
  return lista.length ? lista[0] : CalendarApp.createCalendar(CALENDARIO, { color: CalendarApp.Color.GREEN });
}

function pedir_(cuerpo) {
  cuerpo.secreto = SECRETO;
  var r = UrlFetchApp.fetch(URL_CENTRAL, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(cuerpo), muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) throw new Error('Mi Central respondió ' + r.getResponseCode());
  return JSON.parse(r.getContentText());
}

function sincronizar() {
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(1000)) return;
  try {
    var trabajos = pedir_({ accion: 'pendientes' }).trabajos || [];
    if (!trabajos.length) return;
    var resultados = trabajos.map(function (t) {
      try {
        if (t.tipo === 'correo') return correo_(t);
        if (t.tipo === 'evento') return evento_(t);
        return { id: t.id, ok: false, error: 'tipo desconocido' };
      } catch (e) {
        return { id: t.id, ok: false, error: String(e) };
      }
    });
    pedir_({ accion: 'resultados', resultados: resultados });
  } finally {
    candado.releaseLock();
  }
}

function correo_(t) {
  var mensaje = {
    to: Session.getEffectiveUser().getEmail(),
    subject: t.asunto,
    htmlBody: t.html,
    name: 'Mi Central',
  };
  if (t.adjunto) mensaje.attachments = [Utilities.newBlob(t.adjunto.texto, 'application/json', t.adjunto.nombre)];
  MailApp.sendEmail(mensaje);
  return { id: t.id, ok: true };
}

function evento_(t) {
  var cal = calendario_();
  var evento = t.evento_id ? cal.getEventById(t.evento_id) : null;
  if (t.accion === 'borrar') {
    if (evento) evento.deleteEvent();
    return { id: t.id, ok: true, evento_id: '' };
  }
  var p = t.fecha.split('-').map(Number);
  var opciones = { description: t.descripcion || '' };
  if (t.hora) {
    var h = t.hora.split(':').map(Number);
    var inicio = new Date(p[0], p[1] - 1, p[2], h[0], h[1]);
    var fin = new Date(inicio.getTime() + 30 * 60000);
    if (evento) { evento.setTitle(t.titulo); evento.setDescription(opciones.description); evento.setTime(inicio, fin); }
    else evento = cal.createEvent(t.titulo, inicio, fin, opciones);
  } else {
    var dia = new Date(p[0], p[1] - 1, p[2], 12, 0);
    if (evento) { evento.setTitle(t.titulo); evento.setDescription(opciones.description); evento.setAllDayDate(dia); }
    else evento = cal.createAllDayEvent(t.titulo, dia, opciones);
  }
  return { id: t.id, ok: true, evento_id: evento.getId() };
}
