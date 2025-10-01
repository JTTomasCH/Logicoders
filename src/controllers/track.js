// src/controllers/track.js
const pool = require("../config/db"); 

exports.getByGuia = async (req, res) => {
  const { guia } = req.params;

  const sql = `
    SELECT
      r.id AS recoleccion_id,
      r.numero_guia,
      r.estado,                            -- <<--- NUEVO
      r.city_from_label    AS ciudad_origen,
      r.city_to_label      AS ciudad_destino,
      r.product_type,
      r.delivery_time,
      r.payment_method,
      r.distance_km,
      r.price_cop,
      r.created_at,

      rem.nombre           AS remitente_nombre,
      rem.doc_numero       AS remitente_doc,
      rem.telefono         AS remitente_tel,
      rem.email            AS remitente_email,
      rem.direccion        AS remitente_dir,
      rem.ciudad_origen    AS remitente_ciudad,

      des.nombre           AS destinatario_nombre,
      des.doc_numero       AS destinatario_doc,
      des.telefono         AS destinatario_tel,
      des.direccion        AS destinatario_dir,
      des.ciudad_destino   AS destinatario_ciudad,

      p.status             AS pago_status,
      p.reference          AS pago_referencia,
      p.amount_cop         AS pago_monto,
      p.bank_name          AS pago_banco,
      p.created_at         AS pago_creado
    FROM recolecciones r
    LEFT JOIN remitentes rem      ON rem.id = r.remitente_id
    LEFT JOIN destinatarios des   ON des.id = r.destinatario_id
    LEFT JOIN (
      SELECT recoleccion_id, status, reference, amount_cop, bank_name, created_at
      FROM pagos
      ORDER BY created_at DESC
    ) p ON p.recoleccion_id = r.id
    WHERE r.numero_guia = ?
    LIMIT 1
  `;

  try {
    const [rows] = await pool.query(sql, [guia]);
    if (!rows.length) return res.status(404).json({ message: "Guía no encontrada" });

    const r = rows[0];

    // (opcional) línea de tiempo simple
    const timeline = [
      { step: "CREADA", at: r.created_at, note: `Solicitud registrada (${r.ciudad_origen} → ${r.ciudad_destino})` },
    ];
    if (r.pago_status) {
      timeline.push({ step: `PAGO_${r.pago_status}`, at: r.pago_creado, note: `Ref. ${r.pago_referencia}` });
    }

    // >>> Clave: devolver 'estado' tal cual para el stepper del front
    res.json({
      guia: r.numero_guia,
      estado: (r.estado || 'CREADO'), // <<--- AQUÍ
      origen: r.ciudad_origen,
      destino: r.ciudad_destino,
      producto: r.product_type,
      tiempo: r.delivery_time,
      metodoPago: r.payment_method,
      distanciaKm: r.distance_km,
      precioCOP: r.price_cop,
      creadoEn: r.created_at,
      remitente: {
        nombre: r.remitente_nombre,
        doc: r.remitente_doc,
        tel: r.remitente_tel,
        email: r.remitente_email,
        direccion: r.remitente_dir,
        ciudad: r.remitente_ciudad,
      },
      destinatario: {
        nombre: r.destinatario_nombre,
        doc: r.destinatario_doc,
        tel: r.destinatario_tel,          // <- tu HTML usa este campo para verificación
        direccion: r.destinatario_dir,
        ciudad: r.destinatario_ciudad,
      },
      pago: r.pago_status ? {
        status: r.pago_status,
        referencia: r.pago_referencia,
        montoCOP: r.pago_monto,
        banco: r.pago_banco,
        creadoEn: r.pago_creado,
      } : null,
      timeline,
    });
  } catch (err) {
    console.error("Track getByGuia error:", err);
    res.status(500).json({ message: "Error consultando la guía" });
  }
};

exports.getEjemplos = async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT numero_guia FROM recolecciones WHERE numero_guia IS NOT NULL ORDER BY id DESC LIMIT 3"
    );
    res.json(rows.map(r => r.numero_guia));
  } catch (err) {
    console.error("Track getEjemplos error:", err);
    res.status(500).json({ message: "Error listando guías" });
  }
};
