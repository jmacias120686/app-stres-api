import "dotenv/config";
import { PrismaClient, StressLevel } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está definida");
}

const pool = new Pool({
  connectionString,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const careers = [
  "Ingeniería de Sistemas",
  "Ingeniería Civil",
  "Ingeniería Industrial",
  "Medicina",
  "Psicología",
  "Derecho",
  "Administración",
  "Enfermería",
];

const subjectsByCareer: Record<string, string[]> = {
  "Ingeniería de Sistemas": ["Base de Datos", "Algoritmos", "Redes", "IA", "Ingeniería de Software"],
  "Ingeniería Civil": ["Resistencia", "Topografía", "Hidráulica", "Estructuras", "Materiales"],
  "Ingeniería Industrial": ["Logística", "Producción", "Calidad", "Seguridad Industrial", "Estadística"],
  "Medicina": ["Anatomía", "Fisiología", "Farmacología", "Patología", "Bioquímica"],
  "Psicología": ["Psicología Clínica", "Neuropsicología", "Desarrollo Humano", "Psicometría", "Terapia"],
  "Derecho": ["Derecho Civil", "Derecho Penal", "Derecho Laboral", "Constitucional", "Procesal"],
  "Administración": ["Finanzas", "Marketing", "Contabilidad", "Talento Humano", "Economía"],
  "Enfermería": ["Cuidados Básicos", "Farmacología", "Salud Pública", "Urgencias", "Anatomía"],
};

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function getStressLevel(params: {
  sleepHours: number;
  examsPending: number;
  assignmentsDue: number;
  heartRateAvg: number;
  moodScore: number;
  perceivedStress: number;
  screenTimeMinutes: number;
}) {
  const {
    sleepHours,
    examsPending,
    assignmentsDue,
    heartRateAvg,
    moodScore,
    perceivedStress,
    screenTimeMinutes,
  } = params;

  let score = 0;

  if (sleepHours < 5) score += 3;
  else if (sleepHours < 6.5) score += 2;

  if (examsPending >= 3) score += 3;
  else if (examsPending >= 1) score += 1;

  if (assignmentsDue >= 4) score += 2;
  else if (assignmentsDue >= 2) score += 1;

  if (heartRateAvg > 85) score += 1;
  if (moodScore <= 4) score += 2;
  if (perceivedStress >= 8) score += 3;
  else if (perceivedStress >= 5) score += 1;

  if (screenTimeMinutes > 300) score += 1;

  let level: StressLevel = StressLevel.LOW;
  let probability = 0.2;

  if (score >= 8) {
    level = StressLevel.HIGH;
    probability = randomFloat(0.8, 0.95);
  } else if (score >= 4) {
    level = StressLevel.MEDIUM;
    probability = randomFloat(0.45, 0.75);
  } else {
    level = StressLevel.LOW;
    probability = randomFloat(0.1, 0.35);
  }

  return { level, probability };
}

async function main() {
  await prisma.stressPrediction.deleteMany();
  await prisma.dailyMetric.deleteMany();
  await prisma.academicLoad.deleteMany();
  await prisma.user.deleteMany();

  const totalUsers = 100;
  const daysPerUser = 60;

  console.log(`Generando ${totalUsers} usuarios...`);

  for (let u = 1; u <= totalUsers; u++) {
    const career = careers[randomInt(0, careers.length - 1)];
    const semester = randomInt(1, 10);

    const user = await prisma.user.create({
      data: {
        name: `Estudiante ${u}`,
        email: `estudiante${u}@universidad.edu`,
        career,
        semester,
      },
    });

    const subjects = subjectsByCareer[career];

    for (const subject of subjects) {
      await prisma.academicLoad.create({
        data: {
          userId: user.id,
          subject,
          examsPending: randomInt(0, 3),
          assignmentsDue: randomInt(0, 5),
          difficulty: randomInt(1, 5),
        },
      });
    }

    for (let d = 0; d < daysPerUser; d++) {
      const date = new Date();
      date.setDate(date.getDate() - d);

      const examsPending = randomInt(0, 3);
      const assignmentsDue = randomInt(0, 5);

      let sleepHours = randomFloat(4, 8);
      let heartRateAvg = randomFloat(60, 95);
      let steps = randomInt(1000, 12000);
      let screenTimeMinutes = randomInt(60, 420);
      let socialMediaMin = randomInt(20, 240);
      let moodScore = randomInt(3, 10);
      let perceivedStress = randomInt(1, 10);

      if (examsPending >= 2 || assignmentsDue >= 4) {
        sleepHours = randomFloat(4, 6);
        perceivedStress = randomInt(6, 10);
        moodScore = randomInt(2, 6);
        heartRateAvg = randomFloat(75, 95);
      }

      const { level, probability } = getStressLevel({
        sleepHours,
        examsPending,
        assignmentsDue,
        heartRateAvg,
        moodScore,
        perceivedStress,
        screenTimeMinutes,
      });

      await prisma.dailyMetric.create({
        data: {
          userId: user.id,
          date,
          heartRateAvg,
          sleepHours,
          steps,
          screenTimeMinutes,
          socialMediaMin,
          moodScore,
          perceivedStress,
        },
      });

      await prisma.stressPrediction.create({
        data: {
          userId: user.id,
          createdAt: date,
          level,
          probability,
          triggerFactor:
            examsPending >= 2
              ? "Carga Académica"
              : sleepHours < 5.5
              ? "Falta de Descanso"
              : screenTimeMinutes > 300
              ? "Uso Excesivo del Móvil"
              : "Factor Mixto",
        },
      });
    }

    if (u % 10 === 0) {
      console.log(`Usuarios procesados: ${u}/${totalUsers}`);
    }
  }

  const users = await prisma.user.count();
  const metrics = await prisma.dailyMetric.count();
  const predictions = await prisma.stressPrediction.count();
  const loads = await prisma.academicLoad.count();

  console.log("Resumen final:");
  console.log({ users, metrics, predictions, loads });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });