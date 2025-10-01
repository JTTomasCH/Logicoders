// public/js/login.js
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) return;

  const emailInput = document.getElementById("email");
  const passInput = document.getElementById("password");
  const toggle = document.querySelector(".toggle-pass");
  const remember = document.getElementById("remember");

  // Mostrar / ocultar contraseña
  if (toggle && passInput) {
    toggle.addEventListener("click", () => {
      const type = passInput.type === "password" ? "text" : "password";
      passInput.type = type;
      const icon = toggle.querySelector("i");
      if (icon) {
        icon.classList.toggle("fa-eye");
        icon.classList.toggle("fa-eye-slash");
      }
    });
  }

  // Autocompletar correo si estaba guardado
  const savedEmail = localStorage.getItem("lc_saved_email");
  if (savedEmail) emailInput.value = savedEmail;

  // Submit del login
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = (emailInput.value || "").trim().toLowerCase();
    const password = passInput.value || "";

    if (!email) { emailInput.reportValidity(); return; }
    if (!password || password.length < 6) { passInput.reportValidity(); return; }

    try {
      const resp = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const ct = resp.headers.get("content-type") || "";
      let data = {};
      try {
        data = ct.includes("application/json") ? await resp.json() : { message: await resp.text() };
      } catch {
        data = { message: "(sin cuerpo de respuesta)" };
      }

      if (!resp.ok) {
        alert(data.message || "Correo o contraseña inválidos.");
        return;
      }

      // Guardar token
      if (data.token) localStorage.setItem("token", data.token);

      // 🔹 Guardar usuario completo para usar en panelremitente.html
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
        // (opcional) también por separado:
        localStorage.setItem("user_name", data.user.name || "");
        localStorage.setItem("user_email", data.user.email || "");
      }

      // Recordar correo si corresponde
      if (remember && remember.checked) {
        localStorage.setItem("lc_saved_email", email);
      } else {
        localStorage.removeItem("lc_saved_email");
      }

      // Redirigir al panel que devolvió el backend
      window.location.href = data.nextUrl || "/";
    } catch (err) {
      console.error(err);
      alert("Error de red. Verifica el servidor.");
    }
  });
});
