// src/routes/track.routes.js
const router = require("express").Router();
const ctrl = require("../controllers/track");

// /api/track/ejemplos  -> últimos 3 números para chips
router.get("/ejemplos", ctrl.getEjemplos);

// /api/track/:guia     -> detalle por número de guía
router.get("/:guia", ctrl.getByGuia);

module.exports = router;
