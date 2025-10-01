// src/controllers/password.js
const crypto = require("crypto");
const bcrypt = require("bcrypt");

class PasswordController {
  /**
   * @param {import('mysql2/promise').Pool} pool
   * @param {import('nodemailer').Transporter} transporter
   */
  constructor(pool, transporter) {
    this.pool = pool;
    this.transporter = transporter;
  }

  // POST /api/password/forgot
  // Body: { email }
  // POST /api/password/forgot
// Body: { email }
forgot = async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Correo inválido." });
  }

  const conn = await this.pool.getConnection();
  try {
    // 1) Verificar que el correo exista en la tabla usuarios
    const [[user]] = await conn.query(
      "SELECT id, name, email FROM usuarios WHERE email = :email LIMIT 1",
      { email }
    );

    if (!user) {
      // Respuesta explícita si NO existe el correo
      return res
        .status(404)
        .json({ message: "No existe una cuenta asociada a ese correo." });
    }

    // 2) Generar token y guardar en password_resets
    const token = crypto.randomBytes(20).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    // Invalidar tokens previos (opcional, recomendable)
    await conn.query(
      "UPDATE password_resets SET used_at = NOW() WHERE user_id = :user_id AND used_at IS NULL",
      { user_id: user.id }
    );

    await conn.query(
      `INSERT INTO password_resets (user_id, email, token, expires_at)
       VALUES (:user_id, :email, :token, :expires_at)`,
      { user_id: user.id, email: user.email, token, expires_at: expiresAt }
    );

    // Enlace para reset (token en query)
    const resetUrl = `${process.env.BASE_URL}/reset_form.html?token=${token}`;

    try {
      await this.transporter.sendMail({
        from: `"LogiCoders" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: "Restablecer contraseña - LogiCoders",
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px">
            <p>Hola ${user.name || ""},</p>
            <p>Recibimos una solicitud para restablecer tu contraseña.</p>
            <p style="text-align:center;margin:24px 0">
              <a href="${resetUrl}"
                 style="background:#007bff;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">
                Restablecer contraseña
              </a>
            </p>
            <p>Este enlace vence en 1 hora. Si no fuiste tú, ignora este mensaje.</p>
          </div>
        `
      });
    } catch (mailErr) {
      console.error("PasswordController.forgot mail error:", mailErr.message);
      return res.status(200).json({
        message: "No se pudo enviar el correo. Usa este enlace para continuar (solo DEV).",
        resetUrl
      });
    }

    return res.json({ message: "Correo enviado para cambiar contraseña." });
  } catch (err) {
    console.error("PasswordController.forgot:", err);
    return res.status(500).json({ message: "Error en el servidor." });
  } finally {
    try { conn.release(); } catch {}
  }
};


  // GET /api/password/validate?token=...
  validate = async (req, res) => {
    const token = (req.query.token || "").trim();
    if (!token) return res.status(400).json({ valid: false, message: "Token faltante." });

    try {
      const [[row]] = await this.pool.query(
        `SELECT pr.*, u.email
         FROM password_resets pr
         JOIN usuarios u ON u.id = pr.user_id
         WHERE pr.token = :token
           AND pr.used_at IS NULL
           AND pr.expires_at > NOW()
         LIMIT 1`,
        { token }
      );

      if (!row) return res.json({ valid: false, message: "Token inválido o expirado." });
      return res.json({ valid: true, email: row.email });
    } catch (err) {
      console.error("PasswordController.validate:", err);
      return res.status(500).json({ valid: false, message: "Error en el servidor." });
    }
  };

  // POST /api/password/reset
  // Body: { token, password }
  reset = async (req, res) => {
    const token = (req.body.token || "").trim();
    const password = req.body.password || "";

    if (!token) return res.status(400).json({ message: "Token faltante." });
    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres." });
    }

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[row]] = await conn.query(
        `SELECT * FROM password_resets
         WHERE token = :token
           AND used_at IS NULL
           AND expires_at > NOW()
         LIMIT 1`,
        { token }
      );

      if (!row) {
        await conn.rollback();
        return res.status(400).json({ message: "Token inválido o expirado." });
      }

      const hash = await bcrypt.hash(password, 10);

      await conn.query(
        "UPDATE usuarios SET password = :password WHERE id = :id",
        { password: hash, id: row.user_id }
      );

      await conn.query(
        "UPDATE password_resets SET used_at = NOW() WHERE id = :id",
        { id: row.id }
      );

      await conn.commit();
      return res.json({ message: "Contraseña actualizada. Ahora puedes iniciar sesión." });
    } catch (err) {
      console.error("PasswordController.reset:", err);
      try { await conn.rollback(); } catch {}
      return res.status(500).json({ message: "Error en el servidor." });
    } finally {
      try { conn.release(); } catch {}
    }
  };
}

module.exports = PasswordController;
