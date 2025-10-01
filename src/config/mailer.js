// src/config/mailer.js
const nodemailer = require("nodemailer");

const transporter =
  process.env.SMTP_SERVICE === "gmail"
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        // 👇 SOLO para desarrollo si tu red mete certificados
        tls: { rejectUnauthorized: false }
      })
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        // 👇 SOLO DEV
        tls: { rejectUnauthorized: false }
      });

module.exports = transporter;
