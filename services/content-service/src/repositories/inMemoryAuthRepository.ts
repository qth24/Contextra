import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { AuthSession, AuthUser, DirectMessage, FriendRequest, PublicUser, SocialOverview, UserDirectoryItem, UserSettings } from "../types/models";
import { postgresPool } from "../utils/postgres";

const defaultSettings: UserSettings = {
  language: "en-US",
  timeZone: "Asia/Bangkok",
  securityMode: "standard",
};

const toPublicUser = (user: AuthUser): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  dateOfBirth: user.dateOfBirth,
  profileImageUrl: user.profileImageUrl,
  createdAt: user.createdAt,
});

const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

const verifyPassword = (password: string, storedHash: string) => {
  const [salt, existingHash] = storedHash.split(":");
  const hash = scryptSync(password, salt, 64);
  const comparison = Buffer.from(existingHash, "hex");
  return timingSafeEqual(hash, comparison);
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  date_of_birth: string | null;
  profile_image_url: string | null;
  created_at: string;
  settings: UserSettings;
};

type FriendshipRow = {
  id: string;
  user_id: string;
  friend_id: string;
  created_at: string;
};

type FriendRequestRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  updated_at: string;
  sender_name: string;
  sender_email: string;
};

type DirectMessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  file_name: string | null;
  file_url: string | null;
  created_at: string;
};

const getFriendshipPair = (leftUserId: string, rightUserId: string) =>
  [leftUserId, rightUserId].sort((left, right) => left.localeCompare(right)) as [string, string];

export class InMemoryAuthRepository {
  async register(name: string, email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await postgresPool.query<UserRow>("SELECT * FROM app_users WHERE email = $1", [normalizedEmail]);
    if (existing.rowCount) {
      throw new Error("Email already exists");
    }

    const user: AuthUser = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      dateOfBirth: undefined,
      profileImageUrl: undefined,
      createdAt: new Date().toISOString(),
    };

    await postgresPool.query(
      `
        INSERT INTO app_users (id, name, email, password_hash, date_of_birth, profile_image_url, settings, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      `,
      [user.id, user.name, user.email, user.passwordHash, null, null, JSON.stringify(defaultSettings), user.createdAt],
    );

    return this.createSession(user.id);
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const result = await postgresPool.query<UserRow>("SELECT * FROM app_users WHERE email = $1", [normalizedEmail]);
    const row = result.rows[0];
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new Error("Invalid email or password");
    }

    return this.createSession(row.id);
  }

  async getPublicUserByToken(token: string) {
    const sessionResult = await postgresPool.query<AuthSession>(
      "SELECT token, user_id AS \"userId\", created_at AS \"createdAt\" FROM app_sessions WHERE token = $1",
      [token],
    );
    const session = sessionResult.rows[0];
    if (!session) {
      return null;
    }

    const user = await this.getPublicUserById(session.userId);
    return user;
  }

  async getPublicUserByEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const result = await postgresPool.query<UserRow>("SELECT * FROM app_users WHERE email = $1", [normalizedEmail]);
    const row = result.rows[0];
    return row ? toPublicUser(this.toAuthUser(row)) : null;
  }

  async getPublicUserById(userId: string) {
    const result = await postgresPool.query<UserRow>("SELECT * FROM app_users WHERE id = $1", [userId]);
    const row = result.rows[0];
    return row ? toPublicUser(this.toAuthUser(row)) : null;
  }

  async listDirectory(userId: string): Promise<UserDirectoryItem[]> {
    const usersResult = await postgresPool.query<UserRow>("SELECT * FROM app_users WHERE id <> $1 ORDER BY created_at DESC", [userId]);
    const friendships = await this.listFriendIds(userId);

    return usersResult.rows.map((row) => ({
      ...toPublicUser(this.toAuthUser(row)),
      isFriend: friendships.has(row.id),
    }));
  }

  async getSocialOverview(userId: string): Promise<SocialOverview> {
    return {
      users: await this.listDirectory(userId),
      friends: await this.listFriends(userId),
      incomingRequests: await this.listFriendRequests(userId, "incoming"),
      outgoingRequests: await this.listFriendRequests(userId, "outgoing"),
    };
  }

  async listFriends(userId: string): Promise<PublicUser[]> {
    const friendIds = await this.listFriendIds(userId);
    if (!friendIds.size) {
      return [];
    }

    const result = await postgresPool.query<UserRow>("SELECT * FROM app_users WHERE id = ANY($1::text[]) ORDER BY name ASC", [[...friendIds]]);
    return result.rows.map((row) => toPublicUser(this.toAuthUser(row)));
  }

  async connectFriends(userId: string, friendUserId: string) {
    if (userId === friendUserId) {
      throw new Error("You cannot connect with yourself");
    }

    const target = await this.getPublicUserById(friendUserId);
    if (!target) {
      throw new Error("User not found");
    }

    const [firstUserId, secondUserId] = getFriendshipPair(userId, friendUserId);
    await postgresPool.query(
      `
        INSERT INTO app_friendships (id, user_id, friend_id, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, friend_id) DO NOTHING
      `,
      [crypto.randomUUID(), firstUserId, secondUserId, new Date().toISOString()],
    );

    return this.listFriends(userId);
  }

  async createFriendRequest(userId: string, receiverUserId: string) {
    if (userId === receiverUserId) {
      throw new Error("You cannot send a friend request to yourself");
    }

    const target = await this.getPublicUserById(receiverUserId);
    if (!target) {
      throw new Error("User not found");
    }

    if (await this.areFriends(userId, receiverUserId)) {
      throw new Error("You are already connected");
    }

    const existing = await postgresPool.query<FriendRequestRow>(
      `
        SELECT request.id, request.sender_id, request.receiver_id, request.status, request.created_at, request.updated_at,
               sender.name AS sender_name, sender.email AS sender_email
        FROM app_friend_requests AS request
        JOIN app_users AS sender ON sender.id = request.sender_id
        WHERE ((request.sender_id = $1 AND request.receiver_id = $2) OR (request.sender_id = $2 AND request.receiver_id = $1))
          AND request.status = 'pending'
      `,
      [userId, receiverUserId],
    );

    if ((existing.rowCount ?? 0) > 0) {
      throw new Error("A pending friend request already exists");
    }

    const now = new Date().toISOString();
    await postgresPool.query(
      `
        INSERT INTO app_friend_requests (id, sender_id, receiver_id, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'pending', $4, $4)
      `,
      [crypto.randomUUID(), userId, receiverUserId, now],
    );

    return this.getSocialOverview(userId);
  }

  async respondToFriendRequest(userId: string, requestId: string, action: "accepted" | "rejected") {
    const result = await postgresPool.query<FriendRequestRow>(
      `
        SELECT request.id, request.sender_id, request.receiver_id, request.status, request.created_at, request.updated_at,
               sender.name AS sender_name, sender.email AS sender_email
        FROM app_friend_requests AS request
        JOIN app_users AS sender ON sender.id = request.sender_id
        WHERE request.id = $1
      `,
      [requestId],
    );
    const request = result.rows[0];
    if (!request || request.receiver_id !== userId) {
      throw new Error("Friend request not found");
    }
    if (request.status !== "pending") {
      throw new Error("Friend request has already been handled");
    }

    const now = new Date().toISOString();
    await postgresPool.query(
      "UPDATE app_friend_requests SET status = $2, updated_at = $3 WHERE id = $1",
      [requestId, action, now],
    );

    if (action === "accepted") {
      const [firstUserId, secondUserId] = getFriendshipPair(request.sender_id, request.receiver_id);
      await postgresPool.query(
        `
          INSERT INTO app_friendships (id, user_id, friend_id, created_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_id, friend_id) DO NOTHING
        `,
        [crypto.randomUUID(), firstUserId, secondUserId, now],
      );
    }

    return this.getSocialOverview(userId);
  }

  async listDirectMessages(userId: string, friendUserId: string): Promise<DirectMessage[]> {
    if (!(await this.areFriends(userId, friendUserId))) {
      throw new Error("You can only chat with connected friends");
    }

    const result = await postgresPool.query<DirectMessageRow>(
      `
        SELECT id, sender_id, receiver_id, content, file_name, file_url, created_at
        FROM app_direct_messages
        WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
        ORDER BY created_at ASC
      `,
      [userId, friendUserId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId,
      friendId: friendUserId,
      senderId: row.sender_id,
      content: row.content,
      fileName: row.file_name || undefined,
      fileUrl: row.file_url || undefined,
      createdAt: row.created_at,
    }));
  }

  async sendDirectMessage(
    userId: string,
    friendUserId: string,
    input: { content: string; fileName?: string; fileUrl?: string },
  ) {
    if (!(await this.areFriends(userId, friendUserId))) {
      throw new Error("You can only chat with connected friends");
    }

    await postgresPool.query(
      `
        INSERT INTO app_direct_messages (id, sender_id, receiver_id, content, file_name, file_url, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [crypto.randomUUID(), userId, friendUserId, input.content.trim(), input.fileName || null, input.fileUrl || null, new Date().toISOString()],
    );

    return this.listDirectMessages(userId, friendUserId);
  }

  async areFriends(userId: string, friendUserId: string) {
    const [firstUserId, secondUserId] = getFriendshipPair(userId, friendUserId);
    const result = await postgresPool.query<FriendshipRow>(
      "SELECT id, user_id, friend_id, created_at FROM app_friendships WHERE user_id = $1 AND friend_id = $2",
      [firstUserId, secondUserId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getSettings(userId: string) {
    const result = await postgresPool.query<UserRow>("SELECT settings FROM app_users WHERE id = $1", [userId]);
    return result.rows[0]?.settings ?? defaultSettings;
  }

  async updateSettings(userId: string, settings: UserSettings) {
    await postgresPool.query("UPDATE app_users SET settings = $2::jsonb WHERE id = $1", [userId, JSON.stringify(settings)]);
    return settings;
  }

  async updateAccount(
    userId: string,
    input: {
      name?: string;
      dateOfBirth?: string;
      profileImageUrl?: string;
      currentPassword?: string;
      newPassword?: string;
    },
  ) {
    const result = await postgresPool.query<UserRow>("SELECT * FROM app_users WHERE id = $1", [userId]);
    const row = result.rows[0];
    if (!row) {
      throw new Error("User not found");
    }

    if (input.newPassword) {
      if (!input.currentPassword || !verifyPassword(input.currentPassword, row.password_hash)) {
        throw new Error("Current password is incorrect");
      }
    }

    const nextName = input.name !== undefined ? input.name.trim() || row.name : row.name;
    const nextDateOfBirth = input.dateOfBirth !== undefined ? input.dateOfBirth || null : row.date_of_birth;
    const nextProfileImageUrl =
      input.profileImageUrl !== undefined ? input.profileImageUrl.trim() || null : row.profile_image_url;
    const nextPasswordHash = input.newPassword ? hashPassword(input.newPassword) : row.password_hash;

    await postgresPool.query(
      `
        UPDATE app_users
        SET name = $2, date_of_birth = $3, profile_image_url = $4, password_hash = $5
        WHERE id = $1
      `,
      [userId, nextName, nextDateOfBirth, nextProfileImageUrl, nextPasswordHash],
    );

    return this.getPublicUserById(userId);
  }

  private async createSession(userId: string) {
    const token = randomBytes(32).toString("hex");
    const createdAt = new Date().toISOString();
    await postgresPool.query(
      "INSERT INTO app_sessions (token, user_id, created_at) VALUES ($1, $2, $3)",
      [token, userId, createdAt],
    );

    const user = await this.getPublicUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    return { token, user };
  }

  private async listFriendRequests(userId: string, mode: "incoming" | "outgoing"): Promise<FriendRequest[]> {
    const whereClause = mode === "incoming" ? "request.receiver_id = $1" : "request.sender_id = $1";
    const result = await postgresPool.query<FriendRequestRow>(
      `
        SELECT request.id, request.sender_id, request.receiver_id, request.status, request.created_at, request.updated_at,
               sender.name AS sender_name, sender.email AS sender_email
        FROM app_friend_requests AS request
        JOIN app_users AS sender ON sender.id = request.sender_id
        WHERE ${whereClause}
        ORDER BY request.updated_at DESC
      `,
      [userId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderEmail: row.sender_email,
      receiverId: row.receiver_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  private async listFriendIds(userId: string) {
    const result = await postgresPool.query<FriendshipRow>(
      `
        SELECT id, user_id, friend_id, created_at
        FROM app_friendships
        WHERE user_id = $1 OR friend_id = $1
      `,
      [userId],
    );

    return new Set(
      result.rows.map((row) => (row.user_id === userId ? row.friend_id : row.user_id)),
    );
  }

  private toAuthUser(row: UserRow): AuthUser {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      dateOfBirth: row.date_of_birth || undefined,
      profileImageUrl: row.profile_image_url || undefined,
      createdAt: row.created_at,
    };
  }
}
