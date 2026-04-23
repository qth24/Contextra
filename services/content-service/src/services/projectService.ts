import {
  AddCollaboratorInput,
  CreateChapterInput,
  CreateBranchInput,
  CreateProjectInput,
  GenerateChapterInput,
  HomeOverview,
  ProjectChatInput,
  ProjectPresenceInput,
  PublicUser,
  UpdateContextInput,
  UpdateProjectSettingsInput,
  UpdateProjectVisibilityInput,
  UpsertCharacterInput,
} from "../types/models";
import { InMemoryAuthRepository } from "../repositories/inMemoryAuthRepository";
import { InMemoryProjectRepository } from "../repositories/inMemoryProjectRepository";
import { AIClient } from "./aiClient";
import { ContextService } from "./contextService";

export class ProjectService {
  constructor(
    private readonly repository: InMemoryProjectRepository,
    private readonly authRepository: InMemoryAuthRepository,
    private readonly contextService: ContextService,
    private readonly aiClient: AIClient,
  ) {}

  listProjects(userId: string) {
    return this.repository.listProjects(userId);
  }

  getHomeOverview(userId: string): Promise<HomeOverview> {
    return this.repository.getHomeOverview(userId);
  }

  getProject(projectId: string, userId: string) {
    return this.repository.getProject(projectId, userId);
  }

  createProject(input: CreateProjectInput, user: PublicUser) {
    return this.repository.createProject(input, user);
  }

  updateContext(projectId: string, userId: string, input: UpdateContextInput) {
    return this.repository.updateContext(projectId, userId, input);
  }

  updateVisibility(projectId: string, userId: string, input: UpdateProjectVisibilityInput) {
    return this.repository.updateVisibility(projectId, userId, input);
  }

  updateSettings(projectId: string, userId: string, input: UpdateProjectSettingsInput) {
    return this.repository.updateSettings(projectId, userId, input);
  }

  async addCollaborator(projectId: string, userId: string, input: AddCollaboratorInput, collaboratorId?: string) {
    const user = await this.authRepository.getPublicUserById(input.friendUserId);
    if (!user) {
      throw new Error("Selected friend does not exist");
    }

    const areFriends = await this.authRepository.areFriends(userId, user.id);
    if (!areFriends) {
      throw new Error("Only connected friends can be added to a team project");
    }

    return this.repository.upsertCollaborator(
      projectId,
      userId,
      {
        id: collaboratorId || crypto.randomUUID(),
        userId: user.id,
        name: user.name,
        email: user.email,
        role: `level-${input.permissionLevel}` as "level-1" | "level-2" | "level-3",
        permissionLevel: input.permissionLevel,
      },
      collaboratorId,
    );
  }

  upsertCharacter(projectId: string, userId: string, input: UpsertCharacterInput, characterId?: string) {
    return this.repository.upsertCharacter(projectId, userId, input, characterId);
  }

  createBranch(projectId: string, userId: string, input: CreateBranchInput) {
    return this.repository.addBranch(projectId, userId, input);
  }

  deleteBranch(projectId: string, userId: string, branchId: string) {
    return this.repository.deleteBranch(projectId, userId, branchId);
  }

  mergeBranch(projectId: string, userId: string, branchId: string) {
    return this.repository.mergeBranch(projectId, userId, branchId);
  }

  updateChapter(projectId: string, userId: string, chapterId: string, title: string, content: string, summary: string) {
    return this.repository.updateChapter(projectId, userId, chapterId, title, content, summary);
  }

  createChapter(projectId: string, userId: string, input: CreateChapterInput) {
    return this.repository.createChapter(projectId, userId, input);
  }

  deleteChapter(projectId: string, userId: string, chapterId: string) {
    return this.repository.deleteChapter(projectId, userId, chapterId);
  }

  updatePresence(projectId: string, user: PublicUser, input: ProjectPresenceInput) {
    return this.repository.upsertPresence(projectId, user, input);
  }

  listProjectChat(projectId: string, userId: string) {
    return this.repository.listProjectChat(projectId, userId);
  }

  sendProjectChat(projectId: string, user: PublicUser, input: ProjectChatInput) {
    return this.repository.sendProjectChat(projectId, user, input);
  }

  async generateChapter(projectId: string, userId: string, input: GenerateChapterInput) {
    const project = await this.repository.getProject(projectId, userId);
    if (!project) {
      return null;
    }

    if (!project.branches.some((branch) => branch.id === input.branchId)) {
      throw new Error("Branch not found");
    }

    if (!String(input.instructions || "").trim()) {
      throw new Error("Generation instructions are required");
    }

    const context = this.contextService.compose(project, input.branchId);
    const generated = await this.aiClient.generateChapter({ input, context });
    const updatedProject = await this.repository.addGeneratedChapter(
      projectId,
      userId,
      input.branchId,
      generated,
      this.contextService.snapshotForGeneratedChapter(context, input, generated.model),
    );

    if (!updatedProject) {
      return null;
    }

    return this.repository.addUsage(projectId, userId, {
      action: "chapter_generation",
      tokens: generated.tokens,
      costUsd: generated.costUsd,
      model: generated.model,
      actor: input.actor,
    });
  }

  restoreVersion(projectId: string, userId: string, versionId: string) {
    return this.repository.restoreVersion(projectId, userId, versionId);
  }

  exportProject(projectId: string, userId: string) {
    return this.repository.getProject(projectId, userId).then((project) => {
      if (!project) {
        return null;
      }

      return this.contextService.exportProject(project);
    });
  }
}
