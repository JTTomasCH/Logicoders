// src/routes/ciudades.routes.js
const express = require("express");
const router = express.Router();
const ciudades = require("../data/colombia.json");

// util: normaliza sin acentos y a minúsculas
const norm = s =>
  (s || "")
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

// aplanar en memoria para búsquedas rápidas
const FLAT = [];
ciudades.forEach(dep => {
  const depName = dep.departamento;
  (dep.ciudades || []).forEach(c => {
    let nombre, lat = null, lng = null;
    if (typeof c === "string") {
      nombre = c;
    } else if (c && typeof c === "object") {
      nombre = c.nombre;
      lat = c.lat ?? null;
      lng = c.lng ?? null;
    }
    if (!nombre) return;

    FLAT.push({
      label: `${nombre} - ${depName}`,
      nombre,
      departamento: depName,
      lat,
      lng,
      // clave normalizada para búsqueda
      key: `${norm(nombre)} ${norm(depName)}`
    });
  });
});

// Devuelve todo (si quieres mantenerlo)
router.get("/", (_req, res) => {
  res.json(ciudades);
});

// /api/ciudades/buscar?q=bo...&full=1
router.get("/buscar", (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);

  const nq = norm(q);
  const matches = FLAT.filter(row =>
    row.key.includes(nq) ||
    norm(row.nombre).includes(nq) ||
    norm(row.departamento).includes(nq)
  ).slice(0, 20);

  if (req.query.full === "1") {
    // devuelve datos útiles para coords
    return res.json(
      matches.map(({ label, nombre, departamento, lat, lng }) => ({
        label, nombre, departamento, lat, lng
      }))
    );
  }
  // compat: solo etiquetas para tu autocomplete actual
  res.json(matches.map(r => r.label));
});

// opcional: obtener coords exactas por etiqueta
// /api/ciudades/geo?label=Leticia%20-%20Amazonas
router.get("/geo", (req, res) => {
  const label = (req.query.label || "").trim();
  if (!label) return res.status(400).json({ message: "Falta label" });
  const row = FLAT.find(r => norm(r.label) === norm(label));
  if (!row) return res.status(404).json({ message: "No encontrada" });
  res.json({
    nombre: row.nombre,
    departamento: row.departamento,
    lat: row.lat,
    lng: row.lng
  });
});

module.exports = router;
