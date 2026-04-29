import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import { PrismaClient, StressLevel } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import axios from "axios";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// URL BASE del servicio Python
const PYTHON_API_BASE_URL =
  process.env.PYTHON_API_BASE_URL || "https://app-stres-ml-production.up.railway.app";

// ==========================================
// ENDPOINT: Obtener Dashboard del Usuario
// ==========================================
app.get("/api/users/:id/dashboard", async (req: Request<{ id: string }>, res: Response) => {
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
    console.error("Error en /api/users/:id/dashboard:", error);
    return res.status(500).json({
      error: "Error al obtener datos del servidor",
    });
  }
});

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
    if (!userId) {
      return res.status(400).json({
        error: "El campo userId es obligatorio.",
      });
    }

    const metricData = {
      heartRateAvg: Number(heartRateAvg) || 0,
      sleepHours: Number(sleepHours) || 0,
      steps: Number(steps) || 0,
      screenTimeMinutes: Number(screenTimeMinutes) || 0,
      socialMediaMin: Number(socialMediaMin) || 0,
      moodScore: Number(moodScore) || 0,
      perceivedStress: Number(perceivedStress) || 0,
    };

    const newMetric = await prisma.dailyMetric.create({
      data: {
        user: { connect: { id: userId } },
        ...metricData,
      },
    });

    const mlResponse = await axios.post(
      `${PYTHON_API_BASE_URL}/predict`,
      metricData,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const { level, probability, triggerFactor } = mlResponse.data;

    if (!level || probability === undefined) {
      return res.status(500).json({
        error: "La API del modelo devolvió una respuesta incompleta.",
        mlResponse: mlResponse.data,
      });
    }

    const newPrediction = await prisma.stressPrediction.create({
      data: {
        userId,
        level: String(level).toUpperCase() as StressLevel,
        probability: Number(probability),
        triggerFactor: triggerFactor || "No especificado",
      },
    });

    return res.status(201).json({
      message: "Datos procesados con éxito por el modelo de Machine Learning",
      metric: newMetric,
      prediction: newPrediction,
    });
  } catch (error: any) {
    console.error("Error en el endpoint /api/metrics:", error);

    if (error.response) {
      return res.status(500).json({
        error: "Error al conectar con el modelo predictivo.",
        detail: error.response.data,
      });
    }

    return res.status(500).json({
      error: "Error al procesar las métricas o conectar con el modelo predictivo.",
      detail: error.message,
    });
  }
});

// ==========================================
// ENDPOINT: Entrenar modelo desde Node
// ==========================================
app.post("/api/model/train", async (_req: Request, res: Response) => {
  try {
    const response = await axios.post(
      `${PYTHON_API_BASE_URL}/train`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 60000,
      }
    );

    return res.json({
      success: true,
      message: "Entrenamiento ejecutado correctamente",
      data: response.data,
    });
  } catch (error: any) {
    console.error("Error en /api/model/train:", error);

    if (error.response) {
      return res.status(500).json({
        success: false,
        error: "Python respondió con error al entrenar",
        detail: error.response.data,
      });
    }

    return res.status(500).json({
      success: false,
      error: "No se pudo ejecutar el entrenamiento",
      detail: error.message,
    });
  }
});

// ==========================================
// ENDPOINT: Obtener todos los usuarios
// ==========================================
app.get("/api/users", async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true },
    });

    return res.json(users);
  } catch (error) {
    console.error("Error en /api/users:", error);
    return res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

// ==========================================
// ENDPOINT: Crear un nuevo usuario
// ==========================================
app.post("/api/users", async (req: Request, res: Response) => {
  const { name, email, career, semester } = req.body;

  try {
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        career,
        semester: parseInt(semester, 10),
      },
    });

    return res.status(201).json(newUser);
  } catch (error: any) {
    console.error("ERROR DETALLADO AL CREAR USUARIO:", error);

    if (error.code === "P2002") {
      return res.status(400).json({
        error: "Este correo electrónico ya está registrado.",
      });
    }

    return res.status(500).json({
      error: "Error interno al crear el estudiante.",
    });
  }
});

// ==========================================
// ENDPOINT: Login por Email
// ==========================================
app.get("/api/users/login/:email", async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: req.params.email },
    });

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    return res.json(user);
  } catch (error) {
    console.error("Error en /api/users/login/:email:", error);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// ==========================================
// ENDPOINT: Obtener último registro de métricas
// ==========================================
app.get("/api/users/:id/last-metrics", async (req: Request, res: Response) => {
  try {
    const lastMetric = await prisma.dailyMetric.findFirst({
      where: { userId: req.params.id },
      orderBy: { createdAt: "desc" },
    });

    return res.json(lastMetric || {});
  } catch (error) {
    console.error("Error en /api/users/:id/last-metrics:", error);
    return res.status(500).json({ error: "Error al obtener métricas" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor Node corriendo en puerto ${PORT}`);
});