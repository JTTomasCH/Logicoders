// src/routes/pagos.routes.js
const express = require('express');
const router = express.Router();
const pool = require("../config/db.js");
const Joi = require('joi');

const pagoSchema = Joi.object({
  recoleccion_id: Joi.number().integer().required(),
  method: Joi.string().valid('PSE').required(),
  payer_name: Joi.string().min(2).max(120).required(),
  payer_doc_type: Joi.string().valid('CC','CE','NIT','PP').required(),
  payer_doc: Joi.string().pattern(/^\d{6,12}$/).required(),
  payer_email: Joi.string().email().required(),
  bank_name: Joi.string().min(2).max(120).required(),
  amount_cop: Joi.number().integer().min(0).required(),
  reference: Joi.string().min(5).max(30).required()
});

router.post('/crear', async (req, res) => {
  const { value, error } = pagoSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.message });

  const v = value;
  const conn = await pool.getConnection();
  try {
    // Verificar recolección y que acepte “En línea”
    const [[rec]] = await conn.execute(
      `SELECT id, payment_method FROM recolecciones WHERE id = :id LIMIT 1`,
      { id: v.recoleccion_id }
    );
    if (!rec) return res.status(404).json({ message: 'Recolección no encontrada' });
    if (rec.payment_method !== 'En línea') {
      return res.status(400).json({ message: 'La recolección no admite pago en línea' });
    }

    // Insertar pago con estado "CREATED" (según tu enum)
    const [ins] = await conn.execute(`
      INSERT INTO pagos
      (recoleccion_id, method, payer_name, payer_doc_type, payer_doc, payer_email, bank_name,
       amount_cop, reference, status, created_at)
      VALUES
      (:rid, :method, :name, :dtype, :doc, :email, :bank,
       :amount, :ref, 'CREATED', NOW())
    `, {
      rid: v.recoleccion_id,
      method: v.method,
      name: v.payer_name,
      dtype: v.payer_doc_type,
      doc: v.payer_doc,
      email: v.payer_email,
      bank: v.bank_name,
      amount: v.amount_cop,
      ref: v.reference
    });

    // Simulación de integración con gateway
    res.json({
      ok: true,
      pago_id: ins.insertId,
      reference: v.reference
      // redirect_url: 'https://gateway/...'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error creando el pago' });
  } finally {
    conn.release();
  }
});

module.exports = router;
