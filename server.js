require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const registroRoutes  = require("./src/routes/registro.routes.js");
const passwordRoutes  = require("./src/routes/password.routes.js");
const userRoutes = require("./src/routes/user.routes.js");
const loginRoutes      = require("./src/routes/login.routes.js"); 
const ciudadesRouter = require("./src/routes/ciudades.routes"); 
const recoleccionesRouter = require("./src/routes/recolecciones.routes.js");  
const pagosRouter     = require("./src/routes/pagos.routes.js");    


const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

app.use("/api", registroRoutes);
app.use("/api/password", passwordRoutes); 
app.use("/api", userRoutes);
app.use("/api/ciudades", ciudadesRouter); 
app.use("/api/recolecciones", recoleccionesRouter);  
app.use("/api/pagos", pagosRouter);        
app.use("/api", loginRoutes);
app.use("/api/track", require("./src/routes/track.routes"));



const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`API LogiCoders escuchando en http://localhost:${port}`);
});
