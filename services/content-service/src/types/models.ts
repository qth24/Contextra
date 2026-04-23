export type ProjectMode = "personal" | "team";
export type CollaboratorRole = "owner" | "level-1" | "level-2" | "level-3";
export type BranchStatus = "active" | "merged";
export type PermissionLevel = 1 | 2 | 3;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  dateOfBirth?: string;
  profileImageUrl?: string;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  dateOfBirth?: string;
  profileImageUrl?: string;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  userId: string;
  createdAt: string;
}

export interface Collaborator {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: CollaboratorRole;
  permissionLevel: PermissionLevel;
}

export interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  createdAt: string;
}

export interface UserDirectoryItem extends PublicUser {
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

export interface ProjectMetadata {
  id: string;
  ownerId: string;
  name: string;
  mode: ProjectMode;
  genre: string;
  summary: string;
  isPublic: boolean;
  coverImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  language: "en-US" | "vi-VN";
  timeZone: string;
  securityMode: "standard" | "strict";
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
  status: BranchStatus;
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

export interface ProjectSnapshotState {
  metadata: ProjectMetadata;
  collaborators: Collaborator[];
  characters: CharacterProfile[];
  chapters: Chapter[];
  branches: Branch[];
  contextMemory: ContextMemory;
  usage: UsageEntry[];
}

export interface VersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
  state: ProjectSnapshotState;
}

export interface ProjectDocument extends ProjectSnapshotState {
  versions: VersionSnapshot[];
  viewerAccess?: {
    canView: boolean;
    canEdit: boolean;
    canManage: boolean;
    isPublicViewer: boolean;
    permissionLevel: PermissionLevel | null;
    role: CollaboratorRole | "public-viewer" | null;
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

export interface CreateProjectInput {
  name: string;
  mode: ProjectMode;
  genre: string;
  summary: string;
  coverImageUrl?: string;
}

export interface UpdateProjectVisibilityInput {
  isPublic: boolean;
}

export interface UpdateProjectSettingsInput {
  mode: ProjectMode;
  isPublic: boolean;
  coverImageUrl?: string;
}

export interface AddCollaboratorInput {
  friendUserId: string;
  permissionLevel: PermissionLevel;
}

export interface FriendRequestInput {
  receiverUserId: string;
}

export interface DirectMessageInput {
  friendUserId: string;
  content: string;
  fileName?: string;
  fileUrl?: string;
}

export interface ProjectPresenceInput {
  chapterId?: string;
  status: "reading" | "editing";
}

export interface ProjectChatInput {
  content: string;
  fileName?: string;
  fileUrl?: string;
}

export interface UpsertCharacterInput {
  name: string;
  role: string;
  memory: string;
  goals?: string;
  traits?: string[];
}

export interface UpdateContextInput {
  tone: string;
  audience: string;
  sharedNotes: string;
  worldRules: string[];
}

export interface CreateBranchInput {
  name: string;
  description: string;
  basedOnChapterId: string;
}

export interface GenerateChapterInput {
  title: string;
  branchId: string;
  instructions: string;
  actor: string;
}

export interface CreateChapterInput {
  title: string;
  branchId: string;
  content: string;
  summary: string;
}

export interface GeneratedChapterPayload {
  title: string;
  summary: string;
  content: string;
  tokens: number;
  costUsd: number;
  model: string;
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
  publicProjects: Array<{
    id: string;
    name: string;
    summary: string;
    genre: string;
    ownerName: string;
    updatedAt: string;
    coverImageUrl?: string;
  }>;
}

export interface SocialOverview {
  users: UserDirectoryItem[];
  friends: PublicUser[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
}
