// src/routes/registro.routes.js
const { Router } = require("express");

// 👇 usa rutas relativas y con .js
const pool = require("../config/db.js");
const transporter = require("../config/mailer.js");
const RegistroController = require("../controllers/registro.js");

const controller = new RegistroController(pool, transporter);
const router = Router();

router.post("/register", controller.register);
router.get("/confirm", controller.confirm);
router.post("/resend", controller.resend);
router.get("/check-email", controller.checkEmail);

module.exports = router;
