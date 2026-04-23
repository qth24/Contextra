import { Request, Response } from "express";
import { AuthenticatedLocals } from "../middleware/requireAuth";
import { ProjectService } from "../services/projectService";

const getParam = (request: Request, key: string) => {
  const value = request.params[key];
  return Array.isArray(value) ? value[0] : value;
};

const getUser = (response: Response) => response.locals.user as AuthenticatedLocals["user"];

export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  listProjects = async (_request: Request, response: Response) => {
    response.json(await this.projectService.listProjects(getUser(response).id));
  };

  homeOverview = async (_request: Request, response: Response) => {
    response.json(await this.projectService.getHomeOverview(getUser(response).id));
  };

  getProject = async (request: Request, response: Response) => {
    const project = await this.projectService.getProject(getParam(request, "projectId"), getUser(response).id);
    if (!project) {
      response.status(404).json({ message: "Project not found" });
      return;
    }

    response.json(project);
  };

  createProject = async (request: Request, response: Response) => {
    const { name, mode, genre, summary } = request.body;
    if (!name || !mode || !genre || !summary) {
      response.status(400).json({ message: "Missing project fields" });
      return;
    }

    const project = await this.projectService.createProject({ name, mode, genre, summary }, getUser(response));
    response.status(201).json(project);
  };

  updateContext = async (request: Request, response: Response) => {
    const { tone, audience, sharedNotes, worldRules } = request.body;
    const project = await this.projectService.updateContext(getParam(request, "projectId"), getUser(response).id, {
      tone,
      audience,
      sharedNotes,
      worldRules: Array.isArray(worldRules) ? worldRules : [],
    });

    if (!project) {
      response.status(404).json({ message: "Project not found" });
      return;
    }

    response.json(project);
  };

  updateVisibility = async (request: Request, response: Response) => {
    const project = await this.projectService.updateVisibility(getParam(request, "projectId"), getUser(response).id, {
      isPublic: Boolean(request.body?.isPublic),
    });
    if (!project) {
      response.status(404).json({ message: "Project not found" });
      return;
    }

    response.json(project);
  };

  updateSettings = async (request: Request, response: Response) => {
    const project = await this.projectService.updateSettings(getParam(request, "projectId"), getUser(response).id, {
      mode: request.body?.mode === "team" ? "team" : "personal",
      isPublic: Boolean(request.body?.isPublic),
      coverImageUrl: request.body?.coverImageUrl ? String(request.body.coverImageUrl) : undefined,
    });
    if (!project) {
      response.status(404).json({ message: "Project not found" });
      return;
    }

    response.json(project);
  };

  upsertCollaborator = async (request: Request, response: Response) => {
    try {
      const { friendUserId, permissionLevel } = request.body;
      const project = await this.projectService.addCollaborator(
        getParam(request, "projectId"),
        getUser(response).id,
        {
          friendUserId,
          permissionLevel: [1, 2, 3].includes(Number(permissionLevel)) ? Number(permissionLevel) as 1 | 2 | 3 : 1,
        },
        getParam(request, "collaboratorId"),
      );

      if (!project) {
        response.status(404).json({ message: "Project not found" });
        return;
      }

      response.json(project);
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Could not add collaborator",
      });
    }
  };

  upsertCharacter = async (request: Request, response: Response) => {
    const { name, role, memory } = request.body;
    const project = await this.projectService.upsertCharacter(
      getParam(request, "projectId"),
      getUser(response).id,
      {
        name,
        role,
        memory,
      },
      getParam(request, "characterId"),
    );

    if (!project) {
      response.status(404).json({ message: "Project not found" });
      return;
    }

    response.json(project);
  };

  createBranch = async (request: Request, response: Response) => {
    const { name, description, basedOnChapterId } = request.body;
    const project = await this.projectService.createBranch(getParam(request, "projectId"), getUser(response).id, {
      name,
      description,
      basedOnChapterId,
    });

    if (!project) {
      response.status(404).json({ message: "Project not found" });
      return;
    }

    response.status(201).json(project);
  };

  deleteBranch = async (request: Request, response: Response) => {
    const project = await this.projectService.deleteBranch(
      getParam(request, "projectId"),
      getUser(response).id,
      getParam(request, "branchId"),
    );

    if (!project) {
      response.status(404).json({ message: "Project not found" });
      return;
    }

    response.json(project);
  };

  mergeBranch = async (request: Request, response: Response) => {
    const project = await this.projectService.mergeBranch(
      getParam(request, "projectId"),
      getUser(response).id,
      getParam(request, "branchId"),
    );
    if (!project) {
      response.status(404).json({ message: "Project not found" });
      return;
    }

    response.json(project);
  };

  updateChapter = async (request: Request, response: Response) => {
    const { title, content, summary } = request.body;
    const project = await this.projectService.updateChapter(
      getParam(request, "projectId"),
      getUser(response).id,
      getParam(request, "chapterId"),
      title,
      content,
      summary,
    );

    if (!project) {
      response.status(404).json({ message: "Project not found" });
      return;
    }

    response.json(project);
  };

  createChapter = async (request: Request, response: Response) => {
    const { title, content, summary, branchId } = request.body;
    const project = await this.projectService.createChapter(getParam(request, "projectId"), getUser(response).id, {
      title,
      content,
      summary,
      branchId,
    });

    if (!project) {
      response.status(404).json({ message: "Project not found" });
      return;
    }

    response.status(201).json(project);
  };

  deleteChapter = async (request: Request, response: Response) => {
    const project = await this.projectService.deleteChapter(
      getParam(request, "projectId"),
      getUser(response).id,
      getParam(request, "chapterId"),
    );

    if (!project) {
      response.status(404).json({ message: "Project not found" });
      return;
    }

    response.json(project);
  };

  updatePresence = async (request: Request, response: Response) => {
    try {
      const activeUsers = await this.projectService.updatePresence(getParam(request, "projectId"), getUser(response), {
        chapterId: request.body?.chapterId,
        status: request.body?.status === "editing" ? "editing" : "reading",
      });

      if (!activeUsers) {
        response.status(404).json({ message: "Project not found" });
        return;
      }

      response.json({ activeUsers });
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Could not update presence",
      });
    }
  };

  projectChat = async (request: Request, response: Response) => {
    const projectId = getParam(request, "projectId");
    try {
      if (request.method === "GET") {
        response.json({ messages: await this.projectService.listProjectChat(projectId, getUser(response).id) });
        return;
      }

      response.status(201).json({
        messages: await this.projectService.sendProjectChat(projectId, getUser(response), {
          content: String(request.body?.content || ""),
          fileName: request.body?.fileName,
          fileUrl: request.body?.fileUrl,
        }),
      });
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Could not access project chat",
      });
    }
  };

  generateChapter = async (request: Request, response: Response) => {
    const { title, branchId, instructions, actor } = request.body;
    try {
      const project = await this.projectService.generateChapter(
        getParam(request, "projectId"),
        getUser(response).id,
        {
          title,
          branchId,
          instructions,
          actor: actor || getUser(response).email,
        },
      );

      if (!project) {
        response.status(404).json({ message: "Project not found" });
        return;
      }

      response.status(201).json(project);
    } catch (error) {
      response.status(502).json({
        message: error instanceof Error ? error.message : "AI generation failed",
      });
    }
  };

  restoreVersion = (request: Request, response: Response) => {
    return this.projectService.restoreVersion(
      getParam(request, "projectId"),
      getUser(response).id,
      getParam(request, "versionId"),
    ).then((project) => {
      if (!project) {
        response.status(404).json({ message: "Project or version not found" });
        return;
      }

      response.json(project);
    });
  };

  exportProject = async (request: Request, response: Response) => {
    const output = await this.projectService.exportProject(getParam(request, "projectId"), getUser(response).id);
    if (!output) {
      response.status(404).json({ message: "Project not found" });
      return;
    }

    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.send(output);
  };
}
