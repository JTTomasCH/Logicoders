// public/js/register.js
document.addEventListener("DOMContentLoaded", () => {
  console.log("[register.js] cargado ✅");

  const form = document.getElementById("registerForm");
  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const userInput = document.getElementById("username");
  const pass = document.getElementById("password");
  const pass2 = document.getElementById("confirmPassword");
  const toggle = document.querySelector(".toggle-pass");


  if (toggle) {
    toggle.addEventListener("click", () => {
      const type = pass.getAttribute("type") === "password" ? "text" : "password";
      pass.setAttribute("type", type);
      const icon = toggle.querySelector("i");
      icon.classList.toggle("fa-eye");
      icon.classList.toggle("fa-eye-slash");
    });
  }


  emailInput.addEventListener("blur", async () => {
    const email = emailInput.value.trim();
    if (!email) return;
    try {
      const r = await fetch(`/api/check-email?email=${encodeURIComponent(email)}`);
      const data = await r.json();
      if (data && data.available === false) {
        emailInput.setCustomValidity(data.message || "Este correo ya está registrado.");
        emailInput.reportValidity();
      } else {
        emailInput.setCustomValidity("");
      }
    } catch {
      emailInput.setCustomValidity(""); 
    }
  });


  form.addEventListener("submit", async (e) => {
    e.preventDefault(); 

    if (pass.value !== pass2.value) {
      pass2.setCustomValidity("Las contraseñas no coinciden");
      pass2.reportValidity();
      return;
    } else {
      pass2.setCustomValidity("");
    }

    const payload = {
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      username: userInput.value.trim(),
      password: pass.value
    };

    try {
      const resp = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        alert(json.message || "No se pudo registrar.");
        return;
      }

      alert(json.message || "¡Registro creado! Revisa tu correo para confirmar.");
      form.reset();
    } catch (err) {
      console.error("Error de red:", err);
      alert("Error de red. Verifica que el servidor esté corriendo en http://localhost:3000");
    }
  });
});
