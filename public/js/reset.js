// public/js/reset.js
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("resetPasswordForm");
  const emailInput = document.getElementById("email");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) { emailInput.reportValidity(); return; }

    try {
      const resp = await fetch("/api/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const json = await resp.json().catch(() => ({}));
      alert(json.message || "Si el correo existe, te enviaremos instrucciones.");

      if (json.resetUrl) {
        console.log("DEV reset url:", json.resetUrl);
        alert("DEV: revisa la consola para el enlace de restablecimiento.");
      }
    } catch (err) {
      console.error(err);
      alert("Error de red.");
    }
  });
});
