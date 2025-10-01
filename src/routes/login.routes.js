// src/routes/login.routes.js
const { Router } = require("express");
const pool = require("../config/db.js");
const LoginController = require("../controllers/login.js");

const controller = new LoginController(pool);
const router = Router();

router.post("/login", controller.login);
router.post("/login/form", controller.loginForm);


module.exports = router; // 👈 exporta el router
