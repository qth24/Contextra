import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { AuthController } from "./controllers/authController";
import { ProjectController } from "./controllers/projectController";
import { InMemoryAuthRepository } from "./repositories/inMemoryAuthRepository";
import { InMemoryProjectRepository } from "./repositories/inMemoryProjectRepository";
import { createAuthRouter } from "./routes/authRoutes";
import { createProjectRouter } from "./routes/projectRoutes";
import { AuthService } from "./services/authService";
import { AIClient } from "./services/aiClient";
import { ContextService } from "./services/contextService";
import { ProjectService } from "./services/projectService";
import { initPostgres } from "./utils/postgres";

const port = Number(process.env.PORT || 4100);
const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";

const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" }));

const authRepository = new InMemoryAuthRepository();
const repository = new InMemoryProjectRepository();
const authService = new AuthService(authRepository);
const contextService = new ContextService();
const aiClient = new AIClient(aiServiceUrl);
const projectService = new ProjectService(repository, authRepository, contextService, aiClient);
const authController = new AuthController(authService);
const controller = new ProjectController(projectService);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function initWithRetry(attempts = 20, delayMs = 2000) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await initPostgres();
      return;
    } catch (error) {
      lastError = error;
      console.error(`PostgreSQL init attempt ${attempt}/${attempts} failed`, error);
      if (attempt < attempts) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "content-service",
    aiServiceUrl,
  });
});

app.use("/", createAuthRouter(authController));
app.use("/", createProjectRouter(controller, authService));

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
  response.status(500).json({
    message: error.message || "Unexpected server error",
  });
});

void initWithRetry()
  .then(() => {
    app.listen(port, () => {
      console.log(`content-service listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize PostgreSQL", error);
    process.exit(1);
  });
