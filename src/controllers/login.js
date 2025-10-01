// src/controllers/login.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

class LoginController {
  /**
   * @param {import('mysql2/promise').Pool} pool
   */
  constructor(pool) {
    this.pool = pool;
    this.jwtSecret = process.env.JWT_SECRET || "change_me";
  }

  // POST /api/login  (API JSON con fetch)
  // Body: { email, password }
  login = async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Faltan credenciales." });
      }

      const emailNorm = String(email).trim().toLowerCase();

      // Traer usuario activo
      const [[user]] = await this.pool.query(
        `SELECT id, name, email, username, password, role_id
         FROM usuarios
         WHERE email = :email
         LIMIT 1`,
        { email: emailNorm }
      );

      if (!user) {
        // Si no existe, verificar si está en pendientes (no confirmado)
        const [[pend]] = await this.pool.query(
          "SELECT id FROM usuarios_pendientes WHERE email = :email LIMIT 1",
          { email: emailNorm }
        );
        if (pend) {
          return res.status(403).json({ message: "Debes confirmar tu cuenta desde el correo." });
        }
        return res.status(401).json({ message: "Correo o contraseña inválidos." });
      }

      // Validar hash y contraseña
      const hash = String(user.password || "");
      if (!hash.startsWith("$2")) {
        // No parece un hash bcrypt válido
        return res.status(401).json({ message: "Correo o contraseña inválidos." });
      }

      const ok = await bcrypt.compare(password, hash);
      if (!ok) {
        return res.status(401).json({ message: "Correo o contraseña inválidos." });
      }

      // Determinar redirección por rol
      const role = Number(user.role_id); // coerción a número por si MySQL devuelve string
      let nextUrl = "/";
      if (role === 1) nextUrl = "/panelremitente.html";
      // futuro:
      // if (role === 2) nextUrl = "/panelrecolector.html";
      if (role === 4) nextUrl = "/administrador.html";

      // Log de diagnóstico (temporal)
      console.log("[API /login] user_id:", user.id, "role_id:", user.role_id, "role(num):", role, "nextUrl:", nextUrl);

      // Crear token JWT
      const token = jwt.sign(
        { sub: user.id, email: user.email, role },
        this.jwtSecret,
        { expiresIn: "2h" }
      );

      return res.json({
        message: "Login exitoso.",
        token,
        user: { id: user.id, name: user.name, email: user.email, role_id: role },
        nextUrl
      });
    } catch (err) {
      console.error("LoginController.login:", err);
      return res.status(500).json({ message: "Error en el servidor." });
    }
  };

  // POST /api/login/form (si alguna vez usas <form action> sin fetch)
  // Body (urlencoded): email, password
  loginForm = async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Faltan credenciales." });
      }

      const emailNorm = String(email).trim().toLowerCase();

      const [[user]] = await this.pool.query(
        `SELECT id, name, email, username, password, role_id
         FROM usuarios
         WHERE email = :email
         LIMIT 1`,
        { email: emailNorm }
      );

      if (!user) {
        const [[pend]] = await this.pool.query(
          "SELECT id FROM usuarios_pendientes WHERE email = :email LIMIT 1",
          { email: emailNorm }
        );
        if (pend) {
          return res.status(403).json({ message: "Debes confirmar tu cuenta desde el correo." });
        }
        return res.status(401).json({ message: "Correo o contraseña inválidos." });
      }

      const hash = String(user.password || "");
      if (!hash.startsWith("$2")) {
        return res.status(401).json({ message: "Correo o contraseña inválidos." });
      }

      const ok = await bcrypt.compare(password, hash);
      if (!ok) {
        return res.status(401).json({ message: "Correo o contraseña inválidos." });
      }

      const role = Number(user.role_id);
      let nextUrl = "/";
      if (role === 1) nextUrl = "/panelremitente.html";
      if (role === 1) nextUrl = "/administrador.html";

      console.log("[API /login/form] user_id:", user.id, "role:", role, "nextUrl:", nextUrl);

      // Si usas fetch a este endpoint, dejamos JSON:
      return res.json({ message: "Login exitoso.", nextUrl });

      // Si usas formulario HTML clásico (sin fetch), en su lugar usa:
      // return res.redirect(nextUrl);
    } catch (err) {
      console.error("LoginController.loginForm:", err);
      return res.status(500).json({ message: "Error en el servidor." });
    }
  };
}

module.exports = LoginController;
