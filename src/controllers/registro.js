// src/controllers/registro.js
const crypto = require("crypto");
const bcrypt = require("bcrypt");

class RegistroController {
  /**
   * @param {import('mysql2/promise').Pool} pool
   * @param {import('nodemailer').Transporter} transporter
   */
  constructor(pool, transporter) {
    this.pool = pool;
    this.transporter = transporter;
  }

  normalizeEmail(email) {
    return (email || "").trim().toLowerCase();
  }
  isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || "");
  }
  isUsername(v) {
    return /^[a-zA-Z0-9_\-\.]{3,30}$/.test(v || "");
  }
  strongEnough(v) {
    return typeof v === "string" && v.length >= 6;
  }

  // POST /api/register
  register = async (req, res) => {
    try {
      const { name, email, username, password } = req.body;

      if (!name || name.trim().length < 2) {
        return res.status(400).json({ message: "Nombre inválido." });
      }
      if (!this.isEmail(email)) {
        return res.status(400).json({ message: "Correo inválido." });
      }
      if (!this.isUsername(username)) {
        return res.status(400).json({
          message: "Usuario inválido (3-30 chars, letras/números/_-.)"
        });
      }
      if (!this.strongEnough(password)) {
        return res.status(400).json({
          message: "La contraseña debe tener al menos 6 caracteres."
        });
      }

      const emailNorm = this.normalizeEmail(email);
      const conn = await this.pool.getConnection();
      try {
        const [[active]] = await conn.query(
          "SELECT id FROM usuarios WHERE email = :email OR username = :username LIMIT 1",
          { email: emailNorm, username }
        );
        if (active) {
          return res.status(409).json({
            message: "El correo o usuario ya existe (cuenta activa)."
          });
        }

        const [[pending]] = await conn.query(
          "SELECT id FROM usuarios_pendientes WHERE email = :email OR username = :username LIMIT 1",
          { email: emailNorm, username }
        );
        if (pending) {
          return res.status(409).json({
            message:
              "Ya hay un registro pendiente para este correo/usuario. Revisa tu bandeja o solicita reenvío."
          });
        }

        const hash = await bcrypt.hash(password, 10);
        const token = crypto.randomBytes(20).toString("hex");

        await conn.query(
          `INSERT INTO usuarios_pendientes (name, email, username, password, token)
           VALUES (:name, :email, :username, :password, :token)`,
          { name: name.trim(), email: emailNorm, username, password: hash, token }
        );

        const confirmUrl = `${process.env.BASE_URL}/api/confirm?token=${token}`;
        await this.transporter.sendMail({
          from: `"LogiCoders" <${process.env.SMTP_USER}>`,
          to: emailNorm,
          subject: "Confirma tu cuenta en LogiCoders",
          html: `
            <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px">
              <h2>¡Hola ${name.trim()}!</h2>
              <p>Gracias por registrarte en <b>LogiCoders</b>.</p>
              <p>Para activar tu cuenta, haz clic:</p>
              <p style="text-align:center;margin:24px 0">
                <a href="${confirmUrl}"
                   style="background:#007bff;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">
                   Confirmar cuenta
                </a>
              </p>
            </div>`
        });

        return res
          .status(201)
          .json({ message: "Registro creado. Revisa tu correo para confirmar." });
      } finally {
        conn.release();
      }
    } // Reemplaza tu catch de register por este:
 catch (err) {
  // Log BASTANTE explícito
  console.error("RegistroController.register: ERROR", {
    code: err.code,
    errno: err.errno,
    sqlState: err.sqlState,
    sqlMessage: err.sqlMessage,
    message: err.message,
    stack: err.stack
  });
  // Si falló MySQL (códigos típicos)
  if (err.code && err.code.startsWith("ER_")) {
    return res.status(500).json({ message: `Error de base de datos: ${err.sqlMessage || err.message}` });
  }
  // Si falló el correo (nodemailer):
  if (/mail|smtp|tls|certificate|self\-signed/i.test(err.message || "")) {
    return res.status(502).json({ message: "No se pudo enviar el correo de confirmación. Verifica SMTP." });
  }
  // Genérico
  return res.status(500).json({ message: "Error en el servidor al registrar." });
}

  };

  // GET /api/confirm?token=...
confirm = async (req, res) => {
  const { token } = req.query;
  if (!token || String(token).length < 8) {
    return res.status(400).send("Token inválido.");
  }

  const conn = await this.pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[pend]] = await conn.query(
      "SELECT * FROM usuarios_pendientes WHERE token = :token LIMIT 1",
      { token }
    );
    if (!pend) {
      await conn.rollback();
      return res.status(404).send("Token no encontrado o ya utilizado.");
    }

    const [[existsActive]] = await conn.query(
      "SELECT id FROM usuarios WHERE email = :email OR username = :username LIMIT 1",
      { email: pend.email, username: pend.username }
    );
    if (existsActive) {
      await conn.query("DELETE FROM usuarios_pendientes WHERE id = :id", { id: pend.id });
      await conn.commit();
      return res.status(200).send("La cuenta ya estaba activada. Puedes iniciar sesión.");
    }

    // 👇 Guardar SIEMPRE con rol 1 (Remitente)
    await conn.query(
      `INSERT INTO usuarios (name, email, username, password, role_id)
       VALUES (:name, :email, :username, :password, :role_id)`,
      {
        name: pend.name,
        email: pend.email,
        username: pend.username,
        password: pend.password,
        role_id: 1
      }
    );

    await conn.query("DELETE FROM usuarios_pendientes WHERE id = :id", { id: pend.id });

    await conn.commit();
    return res.redirect("/login.html");
  } catch (err) {
    console.error("RegistroController.confirm:", err);
    try { await conn.rollback(); } catch {}
    return res.status(500).send("Error al confirmar la cuenta.");
  } finally {
    try { conn.release(); } catch {}
  }
};

  // POST /api/resend
  resend = async (req, res) => {
    try {
      const email = this.normalizeEmail(req.body.email);
      if (!this.isEmail(email)) {
        return res.status(400).json({ message: "Correo inválido." });
      }

      const [[pend]] = await this.pool.query(
        "SELECT * FROM usuarios_pendientes WHERE email = :email LIMIT 1",
        { email }
      );
      if (!pend) {
        return res.status(404).json({
          message: "No hay registro pendiente con ese correo. Si ya confirmaste, inicia sesión."
        });
      }

      const confirmUrl = `${process.env.BASE_URL}/api/confirm?token=${pend.token}`;
      await this.transporter.sendMail({
        from: `"LogiCoders" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Reenvío: confirma tu cuenta",
        html: `<p>Hola ${pend.name}, aquí tienes de nuevo tu enlace:</p><p><a href="${confirmUrl}">${confirmUrl}</a></p>`
      });

      return res.json({ message: "Correo de confirmación reenviado." });
    } catch (err) {
      console.error("RegistroController.resend:", err);
      return res.status(500).json({ message: "Error en el servidor." });
    }
  };

  // GET /api/check-email?email=...
  checkEmail = async (req, res) => {
    try {
      const email = this.normalizeEmail(req.query.email);
      if (!this.isEmail(email)) {
        return res.status(400).json({ available: false, message: "Correo inválido." });
      }

      const [[exists]] = await this.pool.query(
        "SELECT id FROM usuarios WHERE email = :email LIMIT 1",
        { email }
      );
      if (exists) return res.json({ available: false, message: "Este correo ya está registrado." });
      return res.json({ available: true });
    } catch (err) {
      console.error("RegistroController.checkEmail:", err);
      return res.status(500).json({ available: false, message: "Error en servidor." });
    }
  };
}

module.exports = RegistroController;
