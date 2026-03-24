import { InMemoryAuthRepository } from "../repositories/inMemoryAuthRepository";

export class AuthService {
  constructor(private readonly repository: InMemoryAuthRepository) {}

  register(name: string, email: string, password: string) {
    if (!name || !email || !password) {
      throw new Error("Missing registration fields");
    }

    return this.repository.register(name, email, password);
  }

  login(email: string, password: string) {
    if (!email || !password) {
      throw new Error("Missing login fields");
    }

    return this.repository.login(email, password);
  }

  getUserByToken(token: string) {
    return this.repository.getPublicUserByToken(token);
  }

  getUserByEmail(email: string) {
    return this.repository.getPublicUserByEmail(email);
  }

  getSettings(userId: string) {
    return this.repository.getSettings(userId);
  }

  updateSettings(userId: string, settings: { language: "en-US" | "vi-VN"; timeZone: string; securityMode: "standard" | "strict" }) {
    return this.repository.updateSettings(userId, settings);
  }

  updateAccount(
    userId: string,
    input: {
      name?: string;
      dateOfBirth?: string;
      profileImageUrl?: string;
      currentPassword?: string;
      newPassword?: string;
    },
  ) {
    return this.repository.updateAccount(userId, input);
  }

  listDirectory(userId: string) {
    return this.repository.listDirectory(userId);
  }

  getSocialOverview(userId: string) {
    return this.repository.getSocialOverview(userId);
  }

  listFriends(userId: string) {
    return this.repository.listFriends(userId);
  }

  connectFriends(userId: string, friendUserId: string) {
    return this.repository.connectFriends(userId, friendUserId);
  }

  createFriendRequest(userId: string, receiverUserId: string) {
    return this.repository.createFriendRequest(userId, receiverUserId);
  }

  respondToFriendRequest(userId: string, requestId: string, action: "accepted" | "rejected") {
    return this.repository.respondToFriendRequest(userId, requestId, action);
  }

  areFriends(userId: string, friendUserId: string) {
    return this.repository.areFriends(userId, friendUserId);
  }

  listDirectMessages(userId: string, friendUserId: string) {
    return this.repository.listDirectMessages(userId, friendUserId);
  }

  sendDirectMessage(userId: string, friendUserId: string, input: { content: string; fileName?: string; fileUrl?: string }) {
    return this.repository.sendDirectMessage(userId, friendUserId, input);
  }
}
