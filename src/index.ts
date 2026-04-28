import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import { PrismaClient, StressLevel } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import axios from "axios"; // <-- Importamos axios para llamar a la API de Python

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000

// ==========================================
// ENDPOINT: Obtener Dashboard del Usuario
// ==========================================
app.get(
  "/api/users/:id/dashboard",
  async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;

    try {
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          stressHistory: {
            orderBy: { createdAt: "desc" },
            take: 7,
          },
          metrics: {
            orderBy: { date: "desc" },
            take: 1,
          },
        },
      });

      if (!user) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      return res.json(user);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Error al obtener datos del servidor" });
    }
  }
);

// ==========================================
// ENDPOINT: Recibir métricas y predecir estrés
// ==========================================
app.post("/api/metrics", async (req: Request, res: Response) => {
  const {
    userId,
    heartRateAvg,
    sleepHours,
    steps,
    screenTimeMinutes,
    socialMediaMin,
    moodScore,
    perceivedStress,
  } = req.body;

  try {
    // 1. Guardamos las métricas crudas en la base de datos
const newMetric = await prisma.dailyMetric.create({
  data: {
    user: { connect: { id: userId } },
    heartRateAvg: heartRateAvg || 0,
    sleepHours: sleepHours || 0,
    steps: steps || 0,
    screenTimeMinutes: screenTimeMinutes || 0, // <-- Si viene vacío, pone 0
    socialMediaMin: socialMediaMin || 0,       // <-- Si viene vacío, pone 0
    moodScore: moodScore || 0,                 // <-- Si viene vacío, pone 0
    perceivedStress: perceivedStress || 0,     // <-- Si viene vacío, pone 0
  }
});
    // 2. LLAMADA A LA API DE PYTHON (MACHINE LEARNING)
    // Le enviamos los datos recién recibidos al modelo Random Forest
    //const pythonApiUrl = 'http://127.0.0.1:5000/predict';
    const pythonApiUrl = 'https://app-stres-ml-production.up.railway.app/predict';

    const mlResponse = await axios.post(pythonApiUrl, {
      heartRateAvg,
      sleepHours,
      steps,
      screenTimeMinutes,
      socialMediaMin,
      moodScore,
      perceivedStress
    });

    // 3. Extraemos la respuesta que nos dio Python
    const { level, probability, triggerFactor } = mlResponse.data;

    // 4. Guardamos la predicción real en la base de datos
    const newPrediction = await prisma.stressPrediction.create({
      data: {
        userId,
        level: level as StressLevel, // Aseguramos que coincide con el ENUM de Prisma (LOW, MEDIUM, HIGH)
        probability,
        triggerFactor,
      },
    });

    // 5. Devolvemos el resultado a la aplicación móvil
    return res.status(201).json({
      message: "Datos procesados con éxito por el modelo de Machine Learning",
      metric: newMetric,
      prediction: newPrediction,
    });
    
  } catch (error) {
    console.error("Error en el endpoint /api/metrics:", error);
    return res.status(500).json({ 
      error: "Error al procesar las métricas o conectar con el modelo predictivo." 
    });
  }
});



// ==========================================
// ENDPOINT: Obtener todos los usuarios
// ==========================================
app.get("/api/users", async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true } // Solo traemos datos básicos
    });
    return res.json(users);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener usuarios" });
  }
});


// ==========================================
// ENDPOINT: Crear un nuevo usuario (Estudiante)
// ==========================================
app.post("/api/users", async (req: Request, res: Response) => {
  // 1. Recibimos también el semester
  const { name, email, career, semester } = req.body; 

  try {
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        career,
        semester: parseInt(semester), // 2. Lo convertimos a número entero para la base de datos
      },
    });
    return res.status(201).json(newUser);
    
  } catch (error: any) {
    console.error("🔍 ERROR DETALLADO AL CREAR USUARIO:", error);
    
    if (error.code === 'P2002') {
      return res.status(400).json({ error: "Este correo electrónico ya está registrado." });
    }

    return res.status(500).json({ error: "Error interno al crear el estudiante." });
  }
});




// 1. Endpoint de Login por Email
app.get("/api/users/login/:email", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: req.params.email }
    });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// 2. Obtener el último registro de métricas del usuario
app.get("/api/users/:id/last-metrics", async (req, res) => {
  try {
    const lastMetric = await prisma.metric.findFirst({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(lastMetric || {});
  } catch (error) {
    res.status(500).json({ error: "Error al obtener métricas" });
  }
});


app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor Node corriendo en puerto ${PORT}`)
})