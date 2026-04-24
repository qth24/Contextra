export interface AuthUser {
  id: string;
  name: string;
  email: string;
  dateOfBirth?: string;
  profileImageUrl?: string;
  createdAt: string;
}

export interface AuthPayload {
  token: string;
  user: AuthUser;
}

export interface ProjectSummary {
  id: string;
  name: string;
  mode: "personal" | "team";
  genre: string;
  summary: string;
  isPublic: boolean;
  coverImageUrl?: string;
  updatedAt: string;
  chapterCount: number;
  activeBranches: number;
  collaboratorCount: number;
  role: string;
}

export interface UserSettings {
  language: "en-US" | "vi-VN";
  timeZone: string;
  securityMode: "standard" | "strict";
}

export interface PublicProjectSummary {
  id: string;
  name: string;
  summary: string;
  genre: string;
  ownerName: string;
  coverImageUrl?: string;
  updatedAt: string;
}

export interface HomeOverview {
  recentProjects: Array<{
    id: string;
    name: string;
    summary: string;
    genre: string;
    updatedAt: string;
    isPublic: boolean;
    coverImageUrl?: string;
  }>;
  publicProjects: PublicProjectSummary[];
}

export interface Collaborator {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: "owner" | "level-1" | "level-2" | "level-3";
  permissionLevel: 1 | 2 | 3;
}

export interface UserDirectoryItem extends AuthUser {
  isFriend: boolean;
}

export interface FriendRequest {
  id: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  receiverId: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export interface DirectMessage {
  id: string;
  userId: string;
  friendId: string;
  senderId: string;
  content: string;
  fileName?: string;
  fileUrl?: string;
  createdAt: string;
}

export interface SocialOverview {
  users: UserDirectoryItem[];
  friends: AuthUser[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
}

export interface CharacterProfile {
  id: string;
  name: string;
  role: string;
  memory: string;
  goals?: string;
  traits?: string[];
  updatedAt: string;
}

export interface ChapterAIContextSnapshot {
  branchName: string;
  projectSummary: string;
  tone: string;
  audience: string;
  sharedNotes: string;
  worldRules: string[];
  characterDigest: string;
  recentChapters: string[];
  instructions: string;
  actor: string;
  model?: string;
  generatedAt: string;
}

export interface Chapter {
  id: string;
  title: string;
  index: number;
  branchId: string;
  summary: string;
  content: string;
  source?: "manual" | "ai";
  aiContext?: ChapterAIContextSnapshot;
  createdAt: string;
}

export interface Branch {
  id: string;
  name: string;
  description: string;
  basedOnChapterId: string;
  status: "active" | "merged";
  mergedInto?: string;
  highlights: string[];
  createdAt: string;
}

export interface ContextMemory {
  tone: string;
  audience: string;
  sharedNotes: string;
  worldRules: string[];
  updatedAt: string;
}

export interface UsageEntry {
  id: string;
  action: string;
  tokens: number;
  costUsd: number;
  model: string;
  actor: string;
  createdAt: string;
}

export interface VersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
}

export interface ProjectDocument {
  metadata: {
    id: string;
    ownerId: string;
    name: string;
    mode: "personal" | "team";
    genre: string;
    summary: string;
    isPublic: boolean;
    coverImageUrl?: string;
    createdAt: string;
    updatedAt: string;
  };
  collaborators: Collaborator[];
  characters: CharacterProfile[];
  chapters: Chapter[];
  branches: Branch[];
  contextMemory: ContextMemory;
  usage: UsageEntry[];
  versions: VersionSnapshot[];
  viewerAccess?: {
    canView: boolean;
    canEdit: boolean;
    canManage: boolean;
    isPublicViewer: boolean;
    permissionLevel: 1 | 2 | 3 | null;
    role: "owner" | "level-1" | "level-2" | "level-3" | "public-viewer" | null;
  };
  activeUsers?: ProjectPresence[];
  chatMessages?: ProjectChatMessage[];
}

export interface ProjectPresence {
  userId: string;
  name: string;
  email: string;
  profileImageUrl?: string;
  status: "reading" | "editing";
  chapterId?: string;
  lastSeen: string;
}

export interface ProjectChatMessage {
  id: string;
  projectId: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  senderProfileImageUrl?: string;
  content: string;
  fileName?: string;
  fileUrl?: string;
  createdAt: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const TOKEN_KEY = "contextra_token";

export const authStorage = {
  getToken: () => window.localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => window.localStorage.setItem(TOKEN_KEY, token),
  clear: () => window.localStorage.removeItem(TOKEN_KEY),
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = authStorage.getToken();
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { message?: string; retryAfterSeconds?: number };
      const suffix = payload.retryAfterSeconds ? ` Retry in ${payload.retryAfterSeconds}s.` : "";
      throw new Error(`${payload.message || "API request failed"}${suffix}`);
    }

    const text = await response.text();
    throw new Error(text || "API request failed");
  }

  if (response.headers.get("content-type")?.includes("text/plain")) {
    return (await response.text()) as T;
  }

  return (await response.json()) as T;
}

export const api = {
  register: (payload: { name: string; email: string; password: string }) =>
    request<AuthPayload>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  login: (payload: { email: string; password: string }) =>
    request<AuthPayload>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  me: () => request<{ user: AuthUser; settings: UserSettings }>("/auth/me"),
  getSettings: () => request<{ settings: UserSettings }>("/auth/settings"),
  updateSettings: (payload: UserSettings) =>
    request<{ settings: UserSettings }>("/auth/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  updateAccount: (payload: {
    name?: string;
    dateOfBirth?: string;
    profileImageUrl?: string;
    currentPassword?: string;
    newPassword?: string;
  }) =>
    request<{ user: AuthUser }>("/auth/account", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  getSocialOverview: () => request<SocialOverview>("/auth/directory"),
  connectFriend: (friendUserId: string) =>
    request<{ friends: AuthUser[] }>("/auth/friends", {
      method: "POST",
      body: JSON.stringify({ friendUserId }),
    }),
  sendFriendRequest: (receiverUserId: string) =>
    request<SocialOverview>("/auth/friend-requests", {
      method: "POST",
      body: JSON.stringify({ receiverUserId }),
    }),
  respondToFriendRequest: (requestId: string, action: "accepted" | "rejected") =>
    request<SocialOverview>(`/auth/friend-requests/${requestId}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    }),
  getDirectMessages: (friendUserId: string) =>
    request<{ messages: DirectMessage[] }>(`/auth/direct-messages/${friendUserId}`),
  sendDirectMessage: (
    friendUserId: string,
    payload: {
      content: string;
      fileName?: string;
      fileUrl?: string;
    },
  ) =>
    request<{ messages: DirectMessage[] }>(`/auth/direct-messages/${friendUserId}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getHomeOverview: () => request<HomeOverview>("/home"),
  listProjects: () => request<ProjectSummary[]>("/projects"),
  getProject: (projectId: string) => request<ProjectDocument>(`/projects/${projectId}`),
  createProject: (payload: {
    name: string;
    mode: "personal" | "team";
    genre: string;
    summary: string;
  }) =>
    request<ProjectDocument>("/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateContext: (
    projectId: string,
    payload: {
      tone: string;
      audience: string;
      sharedNotes: string;
      worldRules: string[];
    },
  ) =>
    request<ProjectDocument>(`/projects/${projectId}/context`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  updateProjectVisibility: (projectId: string, isPublic: boolean) =>
    request<ProjectDocument>(`/projects/${projectId}/visibility`, {
      method: "PATCH",
      body: JSON.stringify({ isPublic }),
    }),
  updateProjectSettings: (
    projectId: string,
    payload: {
      mode: "personal" | "team";
      isPublic: boolean;
      coverImageUrl?: string;
    },
  ) =>
    request<ProjectDocument>(`/projects/${projectId}/settings`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  addCollaborator: (
    projectId: string,
    payload: {
      friendUserId: string;
      permissionLevel: 1 | 2 | 3;
    },
  ) =>
    request<ProjectDocument>(`/projects/${projectId}/collaborators`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createCharacter: (
    projectId: string,
    payload: {
      name: string;
      role: string;
      memory: string;
    },
  ) =>
    request<ProjectDocument>(`/projects/${projectId}/characters`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createChapter: (
    projectId: string,
    payload: {
      title: string;
      summary: string;
      content: string;
      branchId: string;
    },
  ) =>
    request<ProjectDocument>(`/projects/${projectId}/chapters`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateChapter: (
    projectId: string,
    chapterId: string,
    payload: {
      title: string;
      summary: string;
      content: string;
    },
  ) =>
    request<ProjectDocument>(`/projects/${projectId}/chapters/${chapterId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  updateProjectPresence: (
    projectId: string,
    payload: {
      status: "reading" | "editing";
      chapterId?: string;
    },
  ) =>
    request<{ activeUsers: ProjectPresence[] }>(`/projects/${projectId}/presence`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  getProjectChat: (projectId: string) =>
    request<{ messages: ProjectChatMessage[] }>(`/projects/${projectId}/chat`),
  sendProjectChat: (
    projectId: string,
    payload: {
      content: string;
      fileName?: string;
      fileUrl?: string;
    },
  ) =>
    request<{ messages: ProjectChatMessage[] }>(`/projects/${projectId}/chat`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createBranch: (
    projectId: string,
    payload: {
      name: string;
      description: string;
      basedOnChapterId: string;
    },
  ) =>
    request<ProjectDocument>(`/projects/${projectId}/branches`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteBranch: (projectId: string, branchId: string) =>
    request<ProjectDocument>(`/projects/${projectId}/branches/${branchId}`, {
      method: "DELETE",
    }),
  mergeBranch: (projectId: string, branchId: string) =>
    request<ProjectDocument>(`/projects/${projectId}/branches/${branchId}/merge`, {
      method: "POST",
    }),
  generateChapter: (
    projectId: string,
    payload: {
      title: string;
      branchId: string;
      instructions: string;
      actor: string;
    },
  ) =>
    request<ProjectDocument>(`/projects/${projectId}/chapters/generate`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  restoreVersion: (projectId: string, versionId: string) =>
    request<ProjectDocument>(`/projects/${projectId}/restore/${versionId}`, {
      method: "POST",
    }),
  deleteChapter: (projectId: string, chapterId: string) =>
    request<ProjectDocument>(`/projects/${projectId}/chapters/${chapterId}`, {
      method: "DELETE",
    }),
  exportProject: (projectId: string) => request<string>(`/projects/${projectId}/export`),
};
