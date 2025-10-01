const { Router } = require("express");
const pool = require("../config/db.js");
const transporter = require("../config/mailer.js");
const PasswordController = require("../controllers/password.js");

const controller = new PasswordController(pool, transporter);
const router = Router();

router.post("/forgot", controller.forgot);
router.get("/validate", controller.validate);
router.post("/reset", controller.reset);

module.exports = router; // 👈 IMPORTANTE
