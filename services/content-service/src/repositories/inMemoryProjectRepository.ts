import {
  Collaborator,
  CreateBranchInput,
  CreateProjectInput,
  GeneratedChapterPayload,
  HomeOverview,
  PermissionLevel,
  ProjectChatInput,
  ProjectChatMessage,
  ProjectDocument,
  ProjectPresence,
  ProjectPresenceInput,
  ProjectSnapshotState,
  PublicUser,
  UpdateContextInput,
  UpdateProjectVisibilityInput,
  UpsertCharacterInput,
  UsageEntry,
  VersionSnapshot,
} from "../types/models";
import { postgresPool } from "../utils/postgres";

const cloneProjectState = (project: ProjectDocument): ProjectSnapshotState => ({
  metadata: structuredClone(project.metadata),
  collaborators: structuredClone(project.collaborators),
  characters: structuredClone(project.characters),
  chapters: structuredClone(project.chapters),
  branches: structuredClone(project.branches),
  contextMemory: structuredClone(project.contextMemory),
  usage: structuredClone(project.usage),
});

type ProjectRow = {
  id: string;
  owner_id: string;
  name: string;
  summary: string;
  genre: string;
  mode: string;
  is_public: boolean;
  updated_at: string;
  document: ProjectDocument;
};

type ProjectPresenceRow = {
  user_id: string;
  name: string;
  email: string;
  profile_image_url: string | null;
  status: "reading" | "editing";
  chapter_id: string | null;
  last_seen: string;
};

type ProjectChatRow = {
  id: string;
  project_id: string;
  sender_id: string;
  sender_name: string;
  sender_email: string;
  sender_profile_image_url: string | null;
  content: string;
  file_name: string | null;
  file_url: string | null;
  created_at: string;
};

export class InMemoryProjectRepository {
  async listProjects(userId: string): Promise<
    Array<{
      id: string;
      name: string;
      mode: ProjectDocument["metadata"]["mode"];
      genre: string;
      summary: string;
      updatedAt: string;
      chapterCount: number;
      activeBranches: number;
      collaboratorCount: number;
      role: string;
      isPublic: boolean;
    }>
  > {
    const projects = await this.loadAllProjects();
    return projects
      .filter((project: ProjectDocument) => this.getPermissionLevel(project, userId) > 0)
      .sort((left: ProjectDocument, right: ProjectDocument) => right.metadata.updatedAt.localeCompare(left.metadata.updatedAt))
      .map((project: ProjectDocument) => {
        const membership = project.collaborators.find((item: Collaborator) => item.userId === userId);
        return {
          id: project.metadata.id,
          name: project.metadata.name,
          mode: project.metadata.mode,
          genre: project.metadata.genre,
          summary: project.metadata.summary,
          updatedAt: project.metadata.updatedAt,
          chapterCount: project.chapters.length,
          activeBranches: project.branches.filter((branch) => branch.status === "active").length,
          collaboratorCount: project.collaborators.length,
          role: membership?.role ?? "public-viewer",
          isPublic: project.metadata.isPublic,
        };
      });
  }

  async listPublicProjects(userId: string): Promise<HomeOverview["publicProjects"]> {
    const projects = await this.loadAllProjects();
    return projects
      .filter((project: ProjectDocument) => project.metadata.isPublic)
      .sort((left: ProjectDocument, right: ProjectDocument) => right.metadata.updatedAt.localeCompare(left.metadata.updatedAt))
      .slice(0, 8)
      .map((project: ProjectDocument) => ({
        id: project.metadata.id,
        name: project.metadata.name,
        summary: project.metadata.summary,
        genre: project.metadata.genre,
        ownerName: project.collaborators.find((item: Collaborator) => item.role === "owner")?.name || "Unknown author",
        updatedAt: project.metadata.updatedAt,
      }));
  }

  async getHomeOverview(userId: string): Promise<HomeOverview> {
    const recentProjects = (await this.listProjects(userId)).slice(0, 6).map((project) => ({
      id: project.id,
      name: project.name,
      summary: project.summary,
      genre: project.genre,
      updatedAt: project.updatedAt,
      isPublic: project.isPublic,
    }));

    return {
      recentProjects,
      publicProjects: await this.listPublicProjects(userId),
    };
  }

  async getProject(projectId: string, userId: string) {
    const project = await this.loadProject(projectId);
    if (!project || (this.getPermissionLevel(project, userId) === 0 && !project.metadata.isPublic)) {
      return null;
    }

    return this.withViewerAccess(await this.attachRealtimeData(project, userId), userId);
  }

  async createProject(input: CreateProjectInput, owner: PublicUser) {
    const now = new Date().toISOString();
    const project: ProjectDocument = {
      metadata: {
        id: crypto.randomUUID(),
        ownerId: owner.id,
        name: input.name,
        mode: input.mode,
        genre: input.genre,
        summary: input.summary,
        isPublic: false,
        createdAt: now,
        updatedAt: now,
      },
      collaborators: [
        {
          id: crypto.randomUUID(),
          userId: owner.id,
          name: owner.name,
          email: owner.email,
          role: "owner",
          permissionLevel: 3,
        },
      ],
      characters: [],
      chapters: [],
      branches: [
        {
          id: "main",
          name: "Main",
          description: "Primary story line",
          basedOnChapterId: "root",
          status: "active",
          highlights: [],
          createdAt: now,
        },
      ],
      contextMemory: {
        tone: "",
        audience: "",
        sharedNotes: "",
        worldRules: [],
        updatedAt: now,
      },
      usage: [],
      versions: [],
    };

    this.captureVersion(project, "Project created");
    await this.saveProject(project);
    return this.withViewerAccess(project, owner.id);
  }

  updateContext(projectId: string, userId: string, input: UpdateContextInput) {
    return this.mutate(projectId, userId, 2, "Context updated", (project) => {
      project.contextMemory = {
        ...input,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  updateVisibility(projectId: string, userId: string, input: UpdateProjectVisibilityInput) {
    return this.mutate(projectId, userId, 3, input.isPublic ? "Project published" : "Project hidden", (project) => {
      project.metadata.isPublic = input.isPublic;
    });
  }

  upsertCollaborator(projectId: string, userId: string, collaborator: Collaborator, collaboratorId?: string) {
    const label = collaboratorId ? "Collaborator updated" : "Collaborator added";
    return this.mutate(projectId, userId, 3, label, (project) => {
      if (project.metadata.mode !== "team") {
        throw new Error("Collaborators can only be added to team projects");
      }

      if (collaboratorId) {
        const current = project.collaborators.find((item) => item.id === collaboratorId);
        if (!current) {
          throw new Error("Collaborator not found");
        }

        current.name = collaborator.name;
        current.email = collaborator.email;
        current.userId = collaborator.userId;
        current.role = collaborator.role;
        current.permissionLevel = collaborator.permissionLevel;
        return;
      }

      const existing = project.collaborators.find((item) => item.userId === collaborator.userId);
      if (existing) {
        existing.role = collaborator.role;
        existing.permissionLevel = collaborator.permissionLevel;
        existing.name = collaborator.name;
        existing.email = collaborator.email;
        return;
      }

      project.collaborators.push(collaborator);
    });
  }

  upsertCharacter(projectId: string, userId: string, input: UpsertCharacterInput, characterId?: string) {
    const label = characterId ? "Character updated" : "Character created";
    return this.mutate(projectId, userId, 2, label, (project) => {
      const now = new Date().toISOString();
      if (characterId) {
        const current = project.characters.find((character) => character.id === characterId);
        if (!current) {
          throw new Error("Character not found");
        }

        current.name = input.name;
        current.role = input.role;
        current.goals = input.goals;
        current.traits = input.traits;
        current.memory = input.memory;
        current.updatedAt = now;
        return;
      }

      project.characters.push({
        id: crypto.randomUUID(),
        ...input,
        updatedAt: now,
      });
    });
  }

  addBranch(projectId: string, userId: string, input: CreateBranchInput) {
    return this.mutate(projectId, userId, 2, "Branch created", (project) => {
      project.branches.push({
        id: crypto.randomUUID(),
        name: input.name,
        description: input.description,
        basedOnChapterId: input.basedOnChapterId,
        status: "active",
        highlights: [],
        createdAt: new Date().toISOString(),
      });
    });
  }

  mergeBranch(projectId: string, userId: string, branchId: string) {
    return this.mutate(projectId, userId, 3, "Branch merged", (project) => {
      const branch = project.branches.find((item) => item.id === branchId);
      if (!branch) {
        throw new Error("Branch not found");
      }

      branch.status = "merged";
      branch.mergedInto = "main";
    });
  }

  addGeneratedChapter(projectId: string, userId: string, branchId: string, payload: GeneratedChapterPayload) {
    return this.mutate(projectId, userId, 2, `Chapter added: ${payload.title}`, (project) => {
      const nextIndex = project.chapters.length + 1;
      project.chapters.push({
        id: crypto.randomUUID(),
        title: payload.title,
        summary: payload.summary,
        content: payload.content,
        branchId,
        index: nextIndex,
        createdAt: new Date().toISOString(),
      });

      const branch = project.branches.find((item) => item.id === branchId);
      if (branch) {
        branch.highlights = [payload.summary, ...branch.highlights].slice(0, 4);
      }
    });
  }

  updateChapter(projectId: string, userId: string, chapterId: string, title: string, content: string, summary: string) {
    return this.mutate(projectId, userId, 2, "Chapter edited", (project) => {
      const chapter = project.chapters.find((item) => item.id === chapterId);
      if (!chapter) {
        throw new Error("Chapter not found");
      }

      chapter.title = title;
      chapter.content = content;
      chapter.summary = summary;
    });
  }

  async upsertPresence(projectId: string, user: PublicUser, input: ProjectPresenceInput) {
    const project = await this.loadProject(projectId);
    if (!project) {
      return null;
    }

    const canView = this.getPermissionLevel(project, user.id) > 0 || project.metadata.isPublic;
    if (!canView) {
      throw new Error("You do not have access to this project");
    }

    if (project.metadata.mode !== "team") {
      return [];
    }

    await postgresPool.query(
      `
        INSERT INTO app_project_presence (project_id, user_id, status, chapter_id, last_seen)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (project_id, user_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          chapter_id = EXCLUDED.chapter_id,
          last_seen = EXCLUDED.last_seen
      `,
      [projectId, user.id, input.status, input.chapterId || null, new Date().toISOString()],
    );

    return this.listActiveUsers(projectId);
  }

  async listProjectChat(projectId: string, userId: string) {
    const project = await this.loadProject(projectId);
    if (!project) {
      return [];
    }

    if (project.metadata.mode !== "team") {
      throw new Error("Project chat is only available in team projects");
    }

    if (this.getPermissionLevel(project, userId) === 0) {
      throw new Error("You do not have access to this team chat");
    }

    return this.fetchProjectChat(projectId);
  }

  async sendProjectChat(projectId: string, user: PublicUser, input: ProjectChatInput) {
    const project = await this.loadProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    if (project.metadata.mode !== "team") {
      throw new Error("Project chat is only available in team projects");
    }

    if (this.getPermissionLevel(project, user.id) === 0) {
      throw new Error("You do not have access to this team chat");
    }

    const content = String(input.content || "").trim();
    if (!content && !input.fileUrl) {
      throw new Error("Message content is required");
    }

    await postgresPool.query(
      `
        INSERT INTO app_project_chat (id, project_id, sender_id, content, file_name, file_url, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        crypto.randomUUID(),
        projectId,
        user.id,
        content,
        input.fileName || null,
        input.fileUrl || null,
        new Date().toISOString(),
      ],
    );

    return this.fetchProjectChat(projectId);
  }

  addUsage(projectId: string, userId: string, entry: Omit<UsageEntry, "id" | "createdAt">) {
    return this.mutate(projectId, userId, 2, "Usage logged", (project) => {
      project.usage.unshift({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...entry,
      });
    });
  }

  restoreVersion(projectId: string, userId: string, versionId: string) {
    return this.mutate(projectId, userId, 3, "Version restored", (project) => {
      const version = project.versions.find((item) => item.id === versionId);
      if (!version) {
        throw new Error("Version not found");
      }

      const restored = structuredClone(version.state);
      project.metadata = {
        ...restored.metadata,
        updatedAt: new Date().toISOString(),
      };
      project.collaborators = restored.collaborators;
      project.characters = restored.characters;
      project.chapters = restored.chapters;
      project.branches = restored.branches;
      project.contextMemory = restored.contextMemory;
      project.usage = restored.usage;
    });
  }

  private async mutate(projectId: string, userId: string, requiredLevel: PermissionLevel, label: string, action: (project: ProjectDocument) => void) {
    const current = await this.loadProject(projectId);
    if (!current || this.getPermissionLevel(current, userId) < requiredLevel) {
      return null;
    }

    const project = structuredClone(current);
    action(project);
    project.metadata.updatedAt = new Date().toISOString();
    this.captureVersion(project, label);
    await this.saveProject(project);
    return this.withViewerAccess(await this.attachRealtimeData(project, userId), userId);
  }

  private async loadProject(projectId: string) {
    const result = await postgresPool.query<ProjectRow>("SELECT * FROM app_projects WHERE id = $1", [projectId]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return this.normalizeProject(row.document);
  }

  private async loadAllProjects(): Promise<ProjectDocument[]> {
    const result = await postgresPool.query<ProjectRow>("SELECT * FROM app_projects ORDER BY updated_at DESC");
    return result.rows.map((row: ProjectRow) => this.normalizeProject(row.document));
  }

  private async attachRealtimeData(project: ProjectDocument, userId: string) {
    if (project.metadata.mode !== "team") {
      return {
        ...project,
        activeUsers: [],
        chatMessages: [],
      };
    }

    if (this.getPermissionLevel(project, userId) === 0) {
      return {
        ...project,
        activeUsers: [],
        chatMessages: [],
      };
    }

    const [activeUsers, chatMessages] = await Promise.all([
      this.listActiveUsers(project.metadata.id),
      this.fetchProjectChat(project.metadata.id),
    ]);

    return {
      ...project,
      activeUsers,
      chatMessages,
    };
  }

  private async saveProject(project: ProjectDocument) {
    project.metadata.updatedAt = new Date().toISOString();
    await postgresPool.query(
      `
        INSERT INTO app_projects (id, owner_id, name, summary, genre, mode, is_public, updated_at, document)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        ON CONFLICT (id)
        DO UPDATE SET
          owner_id = EXCLUDED.owner_id,
          name = EXCLUDED.name,
          summary = EXCLUDED.summary,
          genre = EXCLUDED.genre,
          mode = EXCLUDED.mode,
          is_public = EXCLUDED.is_public,
          updated_at = EXCLUDED.updated_at,
          document = EXCLUDED.document
      `,
      [
        project.metadata.id,
        project.metadata.ownerId,
        project.metadata.name,
        project.metadata.summary,
        project.metadata.genre,
        project.metadata.mode,
        project.metadata.isPublic,
        project.metadata.updatedAt,
        JSON.stringify(project),
      ],
    );
  }

  private getMembership(project: ProjectDocument, userId: string) {
    if (project.metadata.ownerId === userId) {
      return {
        role: "owner" as const,
        permissionLevel: 3 as PermissionLevel,
      };
    }

    const membership = project.collaborators.find((item) => item.userId === userId);
    if (!membership) {
      return null;
    }

    return {
      role: membership.role,
      permissionLevel: membership.permissionLevel ?? 1,
    };
  }

  private getPermissionLevel(project: ProjectDocument, userId: string): PermissionLevel | 0 {
    return this.getMembership(project, userId)?.permissionLevel ?? 0;
  }

  private captureVersion(project: ProjectDocument, label: string) {
    const version: VersionSnapshot = {
      id: crypto.randomUUID(),
      label,
      createdAt: new Date().toISOString(),
      state: cloneProjectState(project),
    };

    project.versions = [version, ...project.versions].slice(0, 20);
  }

  private normalizeProject(project: ProjectDocument): ProjectDocument {
    return {
      ...project,
      collaborators: project.collaborators.map((item) => {
        const legacyRole = item.role as string;
        return {
          ...item,
          role:
            legacyRole === "editor"
              ? "level-2"
              : legacyRole === "reviewer" || legacyRole === "viewer"
                ? "level-1"
                : item.role,
          permissionLevel:
            item.role === "owner"
              ? 3
              : legacyRole === "editor"
                ? 2
                : item.permissionLevel ?? 1,
        };
      }),
      metadata: {
        ...project.metadata,
        isPublic: Boolean(project.metadata.isPublic),
      },
      activeUsers: project.activeUsers ?? [],
      chatMessages: project.chatMessages ?? [],
    };
  }

  private async listActiveUsers(projectId: string): Promise<ProjectPresence[]> {
    await postgresPool.query(
      "DELETE FROM app_project_presence WHERE project_id = $1 AND last_seen < NOW() - INTERVAL '30 seconds'",
      [projectId],
    );

    const result = await postgresPool.query<ProjectPresenceRow>(
      `
        SELECT presence.user_id, user_table.name, user_table.email, user_table.profile_image_url,
               presence.status, presence.chapter_id, presence.last_seen
        FROM app_project_presence AS presence
        JOIN app_users AS user_table ON user_table.id = presence.user_id
        WHERE presence.project_id = $1
        ORDER BY presence.last_seen DESC
      `,
      [projectId],
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      profileImageUrl: row.profile_image_url || undefined,
      status: row.status,
      chapterId: row.chapter_id || undefined,
      lastSeen: row.last_seen,
    }));
  }

  private async fetchProjectChat(projectId: string): Promise<ProjectChatMessage[]> {
    const result = await postgresPool.query<ProjectChatRow>(
      `
        SELECT chat.id, chat.project_id, chat.sender_id, user_table.name AS sender_name, user_table.email AS sender_email,
               user_table.profile_image_url AS sender_profile_image_url, chat.content, chat.file_name, chat.file_url, chat.created_at
        FROM app_project_chat AS chat
        JOIN app_users AS user_table ON user_table.id = chat.sender_id
        WHERE chat.project_id = $1
        ORDER BY chat.created_at DESC
        LIMIT 60
      `,
      [projectId],
    );

    return result.rows.reverse().map((row) => ({
      id: row.id,
      projectId: row.project_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderEmail: row.sender_email,
      senderProfileImageUrl: row.sender_profile_image_url || undefined,
      content: row.content,
      fileName: row.file_name || undefined,
      fileUrl: row.file_url || undefined,
      createdAt: row.created_at,
    }));
  }

  private withViewerAccess(project: ProjectDocument, userId: string): ProjectDocument {
    const membership = this.getMembership(project, userId);
    const isPublicViewer = !membership && project.metadata.isPublic;
    return {
      ...structuredClone(project),
      viewerAccess: {
        canView: Boolean(membership) || project.metadata.isPublic,
        canEdit: membership ? membership.permissionLevel >= 2 : false,
        canManage: membership ? membership.permissionLevel >= 3 : false,
        isPublicViewer,
        permissionLevel: membership?.permissionLevel ?? null,
        role: membership?.role ?? (isPublicViewer ? "public-viewer" : null),
      },
    };
  }
}
