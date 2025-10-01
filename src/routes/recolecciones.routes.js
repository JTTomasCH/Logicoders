// src/routes/recolecciones.routes.js
const express = require('express');
const router = express.Router();
const pool = require("../config/db.js");
const Joi = require('joi');
const PDFDocument = require('pdfkit');
// 🔁 Usa el transporter centralizado
const transporter = require("../config/mailer");

/* ================== Validaciones ================== */
const persona = Joi.object({
  nombre: Joi.string().min(2).max(120).required(),
  doc_numero: Joi.string().pattern(/^\d{6,15}$/).required(),
  telefono: Joi.string().min(7).max(20).required(),
  email: Joi.string().email().allow(null, ''),
  direccion: Joi.string().min(3).max(200).required(),
  ciudad_origen: Joi.string().min(2).max(120),
  ciudad_destino: Joi.string().min(2).max(120)
});

const schema = Joi.object({
  user_id: Joi.number().integer().required(),
  product_type: Joi.string().valid('Documentos', 'Paquetes').required(),
  delivery_time: Joi.string().valid('Normal', 'Urgente').required(),
  transport_type: Joi.string().valid('Terrestre').required(),
  payment_method: Joi.string().valid('Contado','Cobro','En línea').required(),
  pickup_date: Joi.string().isoDate().required(),
  pickup_hour: Joi.string().pattern(/^\d{2}:\d{2}:\d{2}$/).required(),
  distance_km: Joi.number().integer().min(0).required(),
  price_cop: Joi.number().integer().min(0).required(),
  declared_value: Joi.number().integer().min(0).optional(),
  notes: Joi.string().allow(null, ''),
  remitente: persona.keys({ ciudad_origen: Joi.string().min(2).max(120).required() }).required(),
  destinatario: persona.keys({ ciudad_destino: Joi.string().min(2).max(120).required() }).required()
});

const FROM_EMAIL = process.env.FROM_EMAIL || process.env.SMTP_USER || 'no-reply@logicoders.local';

/* ================== Helpers DB ================== */
async function upsertRemitente(conn, r, userId) {
  const [[exists]] = await conn.execute(
    `SELECT id FROM remitentes WHERE user_id = ? LIMIT 1`, [userId]
  );

  if (exists) {
    await conn.execute(
      `UPDATE remitentes
       SET nombre=?, doc_numero=?, telefono=?, email=?, direccion=?, ciudad_origen=?
       WHERE id=?`,
      [r.nombre, r.doc_numero, r.telefono, r.email || '', r.direccion, r.ciudad_origen, exists.id]
    );
    return exists.id;
  }

  const [ins] = await conn.execute(
    `INSERT INTO remitentes
     (user_id, nombre, doc_numero, telefono, email, direccion, ciudad_origen, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [userId, r.nombre, r.doc_numero, r.telefono, r.email || '', r.direccion, r.ciudad_origen]
  );
  return ins.insertId;
}

async function upsertDestinatario(conn, d) {
  const [[found]] = await conn.execute(
    `SELECT id FROM destinatarios WHERE doc_numero=? LIMIT 1`, [d.doc_numero]
  );

  if (found) {
    await conn.execute(
      `UPDATE destinatarios
       SET nombre=?, telefono=?, direccion=?, ciudad_destino=?
       WHERE id=?`,
      [d.nombre, d.telefono, d.direccion, d.ciudad_destino, found.id]
    );
    return found.id;
  }

  const [ins] = await conn.execute(
    `INSERT INTO destinatarios
     (nombre, doc_numero, telefono, direccion, ciudad_destino, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [d.nombre, d.doc_numero, d.telefono, d.direccion, d.ciudad_destino]
  );
  return ins.insertId;
}

async function getRecoleccionFull(conn, id) {
  const [rows] = await conn.execute(
    `SELECT
       r.id, r.numero_guia, r.created_at, r.pickup_date, r.pickup_hour,
       r.product_type, r.delivery_time, r.transport_type, r.payment_method,
       r.price_cop, r.declared_value, r.distance_km,
       r.city_from_label, r.city_to_label, r.notes,
       d.nombre   AS dest_nombre, d.doc_numero AS dest_doc, d.telefono AS dest_tel,
       d.direccion AS dest_dir, d.ciudad_destino AS dest_city,
       rem.nombre AS rem_nombre, rem.doc_numero AS rem_doc, rem.telefono AS rem_tel,
       rem.email  AS rem_email, rem.direccion AS rem_dir, rem.ciudad_origen AS rem_city
     FROM recolecciones r
     JOIN destinatarios d ON d.id = r.destinatario_id
     JOIN remitentes   rem ON rem.id = r.remitente_id
     WHERE r.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

/* ================== Helpers UI/PDF/Email ================== */
function formatCOP(n){
  try { return Number(n).toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}); }
  catch { return `${n}`; }
}
function fechaCorta(iso){
  try { return new Date(iso).toLocaleString('es-CO', { dateStyle:'medium', timeStyle:'short' }); }
  catch { return iso; }
}

/* ================== Estilos PDF ================== */
const BRAND     = '#d89d13';
const BRAND_2   = '#ffb627';
const INK       = '#1f2937';
const MUTED     = '#6b7280';
const LINE      = '#e6ebf3';
const CARD_BG   = '#ffffff';

/** Dibuja un título de sección con línea sutil */
function sectionTitle(doc, text, x, y, w) {
  doc.save();
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(text, x, y);
  const yy = doc.y + 6;
  doc.moveTo(x, yy).lineTo(x + w, yy).strokeColor(LINE).lineWidth(1).stroke();
  doc.restore();
  return yy + 8;
}

/** Dibuja key/value en dos líneas (clave gris, valor fuerte) */
function kvPair(doc, k, v, x, y, colW) {
  doc.save();
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(k, x, y, { width: colW });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(v ?? '—', x, doc.y - 1, { width: colW });
  doc.restore();
}

/** Badge redondeado */
function badge(doc, text, x, y) {
  const padX = 8, padY = 4;
  const w = doc.widthOfString(text) + padX*2;
  const h = doc.currentLineHeight() + padY;
  doc.save();
  doc.roundedRect(x, y, w, h, 8).fillAndStroke('#fff7e6', '#f3d19a');
  doc.fillColor('#a66400').font('Helvetica-Bold').fontSize(10)
     .text(text, x + padX, y + padY/2, { width: w - padX*2, align:'center' });
  doc.restore();
  return { w, h };
}

/** Render “bonito” del comprobante (naranja, cards, badges) */
function renderComprobantePDF(doc, row) {
  const guia = row.numero_guia || ('REC-' + row.id);

  // Márgenes y canvas
  const M = 40;
  doc.info.Title = `Comprobante ${guia}`;
  doc.rect(0,0,doc.page.width,doc.page.height).fill('#f6f8fb'); // fondo
  doc.fillColor(INK);

  // Header en naranja
  const headerH = 72;
  doc.save();
  doc.fillColor(BRAND).rect(0,0,doc.page.width,headerH).fill();
  doc.fillColor('#ffffff');
  doc.font('Helvetica-Bold').fontSize(18).text('Comprobante de solicitud', M, 22, { align:'left' });
  doc.font('Helvetica').fontSize(11)
     .text(`Número de guía: ${guia}`, M, 46)
     .text(`Fecha de creación: ${fechaCorta(row.created_at)}`, M + 240, 46);
  // barra inferior secundaria
  doc.fillColor(BRAND_2).rect(0, headerH - 4, doc.page.width, 4).fill();
  doc.restore();

  // Card contenedor
  const cardX = M;
  const cardY = headerH + 16;
  const cardW = doc.page.width - M*2;
  const cardH = doc.page.height - cardY - M;
  doc.save();
  doc.roundedRect(cardX, cardY, cardW, cardH, 16).fillAndStroke(CARD_BG, '#e7ebf3');
  doc.restore();

  let x = cardX + 18;
  let y = cardY + 16;
  const innerW = cardW - 36;

  // ===== Resumen =====
  y = sectionTitle(doc, 'Resumen', x, y, innerW);
  const col = innerW / 3 - 10;
  kvPair(doc, 'Producto', row.product_type, x, y, col);
  kvPair(doc, 'Tiempo', row.delivery_time, x + col + 15, y, col);
  kvPair(doc, 'Transporte', row.transport_type, x + (col + 15)*2, y, col);

  y += 44;
  kvPair(doc, 'Forma de pago', row.payment_method, x, y, col);
  kvPair(doc, 'Valor estimado', formatCOP(row.price_cop), x + col + 15, y, col);
  kvPair(doc, 'Valor declarado', formatCOP(row.declared_value || 0), x + (col + 15)*2, y, col);

  // Línea separadora
  y += 46;
  doc.moveTo(x, y).lineTo(x + innerW, y).strokeColor(LINE).lineWidth(1).stroke();
  y += 14;

  // ===== Programación =====
  y = sectionTitle(doc, 'Programación', x, y, innerW);
  kvPair(doc, 'Fecha y hora', `${row.pickup_date} ${row.pickup_hour?.slice(0,5) || ''}`, x, y, innerW/2 - 8);
  kvPair(doc, 'Distancia estimada', `${row.distance_km ?? '—'} km`, x + innerW/2 + 8, y, innerW/2 - 8);

  // ===== Remitente / Destinatario (dos columnas) =====
  y += 48;
  doc.moveTo(x, y).lineTo(x + innerW, y).strokeColor(LINE).lineWidth(1).stroke();
  y += 14;

  const colW = (innerW / 2) - 10;
  // Remitente
  y = sectionTitle(doc, 'Remitente', x, y, colW);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12)
     .text(`${row.rem_nombre} (${row.rem_tel})`, x, y, { width: colW });
  doc.fillColor(MUTED).font('Helvetica').fontSize(11)
     .text(row.rem_dir, x, doc.y + 2, { width: colW })
     .text(row.city_from_label, x, doc.y + 2, { width: colW });

  // Destinatario
  let y2 = sectionTitle(doc, 'Destinatario', x + colW + 20, y - 22, colW); // alinea tope
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12)
     .text(`${row.dest_nombre} (${row.dest_tel})`, x + colW + 20, y2, { width: colW });
  doc.fillColor(MUTED).font('Helvetica').fontSize(11)
     .text(row.dest_dir, x + colW + 20, doc.y + 2, { width: colW });

  // Badge ciudad destino
  const badgeY = doc.y + 6;
  badge(doc, row.city_to_label, x + colW + 20, badgeY);

  // Avanza Y al mayor de ambas columnas
  y = Math.max(doc.y + 28, badgeY + 36);

  // ===== Observaciones =====
  if (row.notes) {
    doc.moveTo(x, y).lineTo(x + innerW, y).strokeColor(LINE).lineWidth(1).stroke();
    y += 14;
    y = sectionTitle(doc, 'Observaciones', x, y, innerW);
    doc.fillColor(INK).font('Helvetica').fontSize(11)
       .text(row.notes, x, y, { width: innerW, align: 'justify' });
    y = doc.y + 6;
  }

  // ===== Pie =====
  doc.fillColor(MUTED).font('Helvetica').fontSize(10)
     .text('Comprobante informativo. El valor final puede variar según condiciones del servicio.',
           x, cardY + cardH - 28, { width: innerW, align:'center' });
}

function buildComprobantePDFBuffer(row) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 }); // margen 0 para pintar fondo
    const chunks = [];
    doc.on('data', d => chunks.push(d));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    renderComprobantePDF(doc, row);
    doc.end();
  });
}

async function sendComprobanteEmail(baseUrl, row, toOverride) {
  const guia = row.numero_guia || ('REC-' + row.id);
  const viewUrl = `${baseUrl}/api/recolecciones/${row.id}/comprobante`;
  const pdf = await buildComprobantePDFBuffer(row);

  const to = (toOverride || row.rem_email || '').trim();
  if (!to) throw new Error('El remitente no tiene correo para enviar el comprobante');

  const html = `
  <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <h2 style="margin:0 0 8px">Comprobante de solicitud</h2>
    <p style="margin:0 0 8px">Guía: <b>${guia}</b></p>
    <p style="margin:0 0 8px">Destinatario: <b>${row.dest_nombre}</b> · ${row.dest_dir} · ${row.city_to_label}</p>
    <p style="margin:0 0 12px">Valor declarado: <b>${formatCOP(row.declared_value || 0)}</b></p>
    <p style="margin:0 0 16px">Puedes <a href="${viewUrl}">ver el comprobante en línea</a> o revisar el PDF adjunto.</p>
  </div>`;

  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    subject: `Comprobante de solicitud ${guia}`,
    html,
    attachments: [{ filename: `Comprobante_${guia}.pdf`, content: pdf, contentType: 'application/pdf' }]
  });
}

/* ================== Crear recolección ================== */
router.post('/', async (req, res) => {
  const { value, error } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.message });

  let conn;
  let tablesLocked = false;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const remitente_id    = await upsertRemitente(conn, value.remitente, value.user_id);
    const destinatario_id = await upsertDestinatario(conn, value.destinatario);

    // BLOQUEO usando query() (no prepared) para evitar ER_UNSUPPORTED_PS
    await conn.query(`LOCK TABLES recolecciones WRITE`);
    tablesLocked = true;

    // Siguiente id visible: MAX(id)+1 (si no hay filas → 1)
    const [maxRows] = await conn.execute(
      `SELECT IFNULL(MAX(id), 0) + 1 AS nextId FROM recolecciones`
    );
    const nextId = maxRows[0].nextId;

    // Numero de guía con fecha actual y correlativo calculado
    const [ngRows] = await conn.execute(
      `SELECT CONCAT('LG-', DATE_FORMAT(NOW(), '%y%m%d'), '-', LPAD(?, 6, '0')) AS numero_guia`,
      [nextId]
    );
    const numeroGuia = ngRows[0].numero_guia;

    // Insert con numero_guia ya calculado
    const [ins] = await conn.execute(
      `INSERT INTO recolecciones
       (user_id, remitente_id, destinatario_id,
        product_type, delivery_time, transport_type, payment_method,
        city_from_label, city_to_label,
        pickup_date, pickup_hour, distance_km, price_cop,
        notes, declared_value, numero_guia, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        value.user_id, remitente_id, destinatario_id,
        value.product_type, value.delivery_time, value.transport_type, value.payment_method,
        value.remitente.ciudad_origen, value.destinatario.ciudad_destino,
        value.pickup_date, value.pickup_hour, value.distance_km, value.price_cop,
        value.notes || null, value.declared_value ?? null, numeroGuia
      ]
    );

    const recoleccionId = ins.insertId;

    // Liberar bloqueo
    await conn.query(`UNLOCK TABLES`);
    tablesLocked = false;

    await conn.commit();

    // ===== Envío de comprobante por correo (no bloquea la respuesta) =====
    setImmediate(async () => {
      let c2;
      try {
        c2 = await pool.getConnection();
        const row = await getRecoleccionFull(c2, recoleccionId);
        if (row) {
          const baseUrl = `${req.protocol}://${req.get('host')}`;
          await sendComprobanteEmail(baseUrl, row);
        }
      } catch (err) {
        console.warn('No se pudo enviar el comprobante por email:', err?.message);
      } finally {
        try { c2?.release?.(); } catch {}
      }
    });

    return res.json({
      ok: true,
      recoleccion_id: recoleccionId,
      numero_guia: numeroGuia
    });
  } catch (e) {
    try { if (tablesLocked) await conn.query(`UNLOCK TABLES`); } catch (_) {}
    try { if (conn) await conn.rollback(); } catch (_) {}

    console.error('ERR /api/recolecciones:', e);
    return res.status(500).json({
      message: e.sqlMessage || e.message || 'Error creando la recolección',
      code: e.code || null
    });
  } finally {
    if (conn) conn.release();
  }
});

/* ================== Comprobante en línea ================== */
router.get('/:id/comprobante', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).send('ID inválido');

  let conn;
  try {
    conn = await pool.getConnection();
    const row = await getRecoleccionFull(conn, id);
    if (!row) return res.status(404).send('Recolección no encontrada');

    const creado = fechaCorta(row.created_at);
    const valor = formatCOP(row.price_cop);
    const declarado = formatCOP(row.declared_value || 0);

    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(`
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Comprobante ${row.numero_guia || ('REC-'+id)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet" />
<style>
  :root{ --brand:#d89d13; --line:#e6ebf3; --text:#1f2937; --muted:#6b7280; }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:Poppins,system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif; background:#f6f8fb; color:var(--text) }
  .wrap{ max-width:840px; margin:24px auto; padding:0 16px }
  .card{ background:#fff; border-radius:16px; padding:18px 20px; box-shadow:0 10px 30px rgba(2,8,20,.06) }
  h1{ margin:6px 0 12px; font-size:22px }
  .row{ display:grid; grid-template-columns:1fr 1fr; gap:14px }
  .k{ color:var(--muted); font-size:.9rem }
  .v{ font-weight:700 }
  .badge{ display:inline-block; background:#fff7e6; border:1px solid #f3d19a; color:#a66400; border-radius:999px; padding:4px 10px; font-weight:700; font-size:.85rem }
  hr{ border:none; border-top:1px solid var(--line); margin:14px 0 }
  .actions{ display:flex; gap:10px; flex-wrap:wrap; margin-top:12px }
  .btn{ background:var(--brand); color:#fff; border:none; padding:10px 14px; border-radius:10px; text-decoration:none; font-weight:700; }
  .muted{ color:var(--muted) }
  .grid-3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px }
  @media (max-width:820px){ .row, .grid-3{ grid-template-columns:1fr } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Comprobante de solicitud</h1>
      <div class="row">
        <div>
          <div class="k">Número de guía</div>
          <div class="v">${row.numero_guia || ('REC-'+id)}</div>
        </div>
        <div>
          <div class="k">Fecha de creación</div>
          <div class="v">${creado}</div>
        </div>
        <div>
          <div class="k">Forma de pago</div>
          <div class="v">${row.payment_method}</div>
        </div>
        <div>
          <div class="k">Valor estimado</div>
          <div class="v">${valor}</div>
        </div>
      </div>

      <hr>

      <div class="grid-3">
        <div>
          <div class="k">Producto</div>
          <div class="v">${row.product_type}</div>
        </div>
        <div>
          <div class="k">Tiempo</div>
          <div class="v">${row.delivery_time}</div>
        </div>
        <div>
          <div class="k">Valor declarado</div>
          <div class="v">${declarado}</div>
        </div>
      </div>

      <hr>

      <div class="row">
        <div>
          <div class="k">Remitente</div>
          <div class="v">${row.rem_nombre} <span class="muted">(${row.rem_tel})</span></div>
          <div class="muted">${row.rem_dir} · ${row.city_from_label}</div>
        </div>
        <div>
          <div class="k">Destinatario</div>
          <div class="v">${row.dest_nombre} <span class="muted">(${row.dest_tel})</span></div>
          <div class="muted">${row.dest_dir} · <span class="badge">${row.city_to_label}</span></div>
        </div>
      </div>

      <hr>

      <div class="row">
        <div>
          <div class="k">Programación</div>
          <div class="v">${row.pickup_date} ${row.pickup_hour?.slice(0,5) || ''}</div>
        </div>
        <div>
          <div class="k">Transporte</div>
          <div class="v">${row.transport_type}</div>
        </div>
      </div>

      ${row.notes ? (`<hr><div><div class="k">Observaciones</div><div class="v">${row.notes}</div></div>`) : ''}

      <div class="actions">
        <a class="btn" href="/api/recolecciones/${id}/comprobante.pdf?download=1">Descargar PDF</a>
        <a class="btn" href="/panelRemitente.html">Volver al panel</a>
      </div>
    </div>
  </div>
</body>
</html>
    `);
  } catch (e) {
    console.error(e);
    res.status(500).send('Error generando comprobante');
  } finally {
    conn?.release?.();
  }
});

/* ================== PDF del comprobante ================== */
router.get('/:id/comprobante.pdf', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).send('ID inválido');

  let conn;
  try {
    conn = await pool.getConnection();
    const row = await getRecoleccionFull(conn, id);
    if (!row) return res.status(404).send('Recolección no encontrada');

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const filename = `Comprobante_${row.numero_guia || ('REC-'+id)}.pdf`;
    const asAttachment = String(req.query.download || '0') === '1';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${asAttachment ? 'attachment' : 'inline'}; filename="${filename}"`);

    // Generar y enviar PDF “bonito” en streaming
    doc.pipe(res);
    renderComprobantePDF(doc, row);
    doc.end();
  } catch (e) {
    console.error(e);
    res.status(500).send('Error generando PDF');
  } finally {
    conn?.release?.();
  }
});

/* ================== Enviar comprobante por correo ================== */
// POST /api/recolecciones/:id/enviar-comprobante  (body opcional: { to: "otro@mail.com" })
router.post('/:id/enviar-comprobante', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });

  let conn;
  try {
    conn = await pool.getConnection();
    const row = await getRecoleccionFull(conn, id);
    if (!row) return res.status(404).json({ message: 'Recolección no encontrada' });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await sendComprobanteEmail(baseUrl, row, req.body?.to);

    return res.json({ ok: true, sent_to: (req.body?.to || row.rem_email) });
  } catch (e) {
    console.error('ERR enviar-comprobante:', e);
    return res.status(500).json({ ok: false, message: e.message || 'Error enviando comprobante' });
  } finally {
    conn?.release?.();
  }
});

module.exports = router;
