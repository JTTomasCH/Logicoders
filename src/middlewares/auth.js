// src/middlewares/auth.js
const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: "No autenticado." });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "change_me");
    // payload: { sub: user.id, email, role, iat, exp }
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token inválido o expirado." });
  }
};
