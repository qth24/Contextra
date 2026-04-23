import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { AuthService } from "../services/authService";
import { ProjectController } from "../controllers/projectController";

export const createProjectRouter = (controller: ProjectController, authService: AuthService) => {
  const router = Router();
  router.use(requireAuth(authService));

  router.get("/home", controller.homeOverview);
  router.get("/projects", controller.listProjects);
  router.post("/projects", controller.createProject);
  router.get("/projects/:projectId", controller.getProject);
  router.patch("/projects/:projectId/context", controller.updateContext);
  router.patch("/projects/:projectId/visibility", controller.updateVisibility);
  router.patch("/projects/:projectId/settings", controller.updateSettings);
  router.post("/projects/:projectId/collaborators", controller.upsertCollaborator);
  router.patch("/projects/:projectId/collaborators/:collaboratorId", controller.upsertCollaborator);
  router.post("/projects/:projectId/characters", controller.upsertCharacter);
  router.patch("/projects/:projectId/characters/:characterId", controller.upsertCharacter);
  router.post("/projects/:projectId/branches", controller.createBranch);
  router.delete("/projects/:projectId/branches/:branchId", controller.deleteBranch);
  router.post("/projects/:projectId/branches/:branchId/merge", controller.mergeBranch);
  router.post("/projects/:projectId/chapters", controller.createChapter);
  router.delete("/projects/:projectId/chapters/:chapterId", controller.deleteChapter);
  router.patch("/projects/:projectId/chapters/:chapterId", controller.updateChapter);
  router.patch("/projects/:projectId/presence", controller.updatePresence);
  router.get("/projects/:projectId/chat", controller.projectChat);
  router.post("/projects/:projectId/chat", controller.projectChat);
  router.post("/projects/:projectId/chapters/generate", controller.generateChapter);
  router.post("/projects/:projectId/restore/:versionId", controller.restoreVersion);
  router.get("/projects/:projectId/export", controller.exportProject);

  return router;
};
