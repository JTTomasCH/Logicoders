// src/routes/user.routes.js
const { Router } = require("express");
const bcrypt = require("bcrypt");
const pool = require("../config/db.js");
const auth = require("../middlewares/auth.js");

const router = Router();

// GET /api/me → devuelve el usuario de la DB según el token
router.get("/me", auth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const [[u]] = await pool.query(
      "SELECT id, name, email, role_id FROM usuarios WHERE id = :id LIMIT 1",
      { id: userId }
    );
    if (!u) return res.status(404).json({ message: "Usuario no encontrado." });
    return res.json({ user: u });
  } catch (err) {
    console.error("GET /api/me:", err);
    return res.status(500).json({ message: "Error en el servidor." });
  }
});

// PUT /api/me/password → actualiza la contraseña del usuario autenticado
router.put("/me/password", auth, async (req, res) => {
  const userId = req.user.sub;
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");

  if (!currentPassword) {
    return res.status(400).json({ message: "Debes indicar tu contraseña actual." });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({
      message: "La nueva contraseña debe tener al menos 6 caracteres."
    });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({
      message: "La nueva contraseña debe ser diferente a la actual."
    });
  }

  try {
    const [[user]] = await pool.query(
      "SELECT password FROM usuarios WHERE id = :id LIMIT 1",
      { id: userId }
    );

    if (!user || !user.password) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const matches = await bcrypt.compare(currentPassword, String(user.password));
    if (!matches) {
      return res.status(401).json({ message: "La contraseña actual es incorrecta." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE usuarios SET password = :password WHERE id = :id",
      { password: hash, id: userId }
    );

    return res.json({ message: "Contraseña actualizada correctamente." });
  } catch (err) {
    console.error("PUT /api/me/password:", err);
    return res.status(500).json({ message: "Error en el servidor." });
  }
});

module.exports = router;
