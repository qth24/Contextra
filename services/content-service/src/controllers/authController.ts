import { Request, Response } from "express";
import { AuthService } from "../services/authService";

const getBearerToken = (request: Request) => {
  const value = request.headers.authorization;
  if (!value?.startsWith("Bearer ")) {
    return null;
  }

  return value.slice(7);
};

const getParam = (request: Request, key: string) => {
  const value = request.params[key];
  return Array.isArray(value) ? value[0] : value;
};

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (request: Request, response: Response) => {
    try {
      const { name, email, password } = request.body;
      response.status(201).json(await this.authService.register(name, email, password));
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Registration failed",
      });
    }
  };

  login = async (request: Request, response: Response) => {
    try {
      const { email, password } = request.body;
      response.json(await this.authService.login(email, password));
    } catch (error) {
      response.status(401).json({
        message: error instanceof Error ? error.message : "Login failed",
      });
    }
  };

  me = async (request: Request, response: Response) => {
    const token = getBearerToken(request);
    if (!token) {
      response.status(401).json({ message: "Missing auth token" });
      return;
    }

    const user = await this.authService.getUserByToken(token);
    if (!user) {
      response.status(401).json({ message: "Invalid auth token" });
      return;
    }

    const settings = await this.authService.getSettings(user.id);
    response.json({ user, settings });
  };

  settings = async (request: Request, response: Response) => {
    const token = getBearerToken(request);
    if (!token) {
      response.status(401).json({ message: "Missing auth token" });
      return;
    }

    const user = await this.authService.getUserByToken(token);
    if (!user) {
      response.status(401).json({ message: "Invalid auth token" });
      return;
    }

    if (request.method === "GET") {
      response.json({ settings: await this.authService.getSettings(user.id) });
      return;
    }

    const { language, timeZone, securityMode } = request.body;
    const settings = await this.authService.updateSettings(user.id, {
      language: language === "vi-VN" ? "vi-VN" : "en-US",
      timeZone: timeZone || "Asia/Bangkok",
      securityMode: securityMode === "strict" ? "strict" : "standard",
    });
    response.json({ settings });
  };

  account = async (request: Request, response: Response) => {
    const token = getBearerToken(request);
    if (!token) {
      response.status(401).json({ message: "Missing auth token" });
      return;
    }

    const user = await this.authService.getUserByToken(token);
    if (!user) {
      response.status(401).json({ message: "Invalid auth token" });
      return;
    }

    try {
      const updatedUser = await this.authService.updateAccount(user.id, {
        name: request.body?.name,
        dateOfBirth: request.body?.dateOfBirth,
        profileImageUrl: request.body?.profileImageUrl,
        currentPassword: request.body?.currentPassword,
        newPassword: request.body?.newPassword,
      });
      response.json({ user: updatedUser });
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Could not update account",
      });
    }
  };

  directory = async (request: Request, response: Response) => {
    const token = getBearerToken(request);
    if (!token) {
      response.status(401).json({ message: "Missing auth token" });
      return;
    }

    const user = await this.authService.getUserByToken(token);
    if (!user) {
      response.status(401).json({ message: "Invalid auth token" });
      return;
    }

    response.json(await this.authService.getSocialOverview(user.id));
  };

  connectFriend = async (request: Request, response: Response) => {
    const token = getBearerToken(request);
    if (!token) {
      response.status(401).json({ message: "Missing auth token" });
      return;
    }

    const user = await this.authService.getUserByToken(token);
    if (!user) {
      response.status(401).json({ message: "Invalid auth token" });
      return;
    }

    try {
      const friends = await this.authService.connectFriends(user.id, String(request.body?.friendUserId || ""));
      response.json({ friends });
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Could not connect friend",
      });
    }
  };

  createFriendRequest = async (request: Request, response: Response) => {
    const token = getBearerToken(request);
    if (!token) {
      response.status(401).json({ message: "Missing auth token" });
      return;
    }

    const user = await this.authService.getUserByToken(token);
    if (!user) {
      response.status(401).json({ message: "Invalid auth token" });
      return;
    }

    try {
      response.status(201).json(await this.authService.createFriendRequest(user.id, String(request.body?.receiverUserId || "")));
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Could not send friend request",
      });
    }
  };

  respondToFriendRequest = async (request: Request, response: Response) => {
    const token = getBearerToken(request);
    if (!token) {
      response.status(401).json({ message: "Missing auth token" });
      return;
    }

    const user = await this.authService.getUserByToken(token);
    if (!user) {
      response.status(401).json({ message: "Invalid auth token" });
      return;
    }

    try {
      response.json(
        await this.authService.respondToFriendRequest(
          user.id,
          getParam(request, "requestId"),
          request.body?.action === "accepted" ? "accepted" : "rejected",
        ),
      );
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Could not update friend request",
      });
    }
  };

  directMessages = async (request: Request, response: Response) => {
    const token = getBearerToken(request);
    if (!token) {
      response.status(401).json({ message: "Missing auth token" });
      return;
    }

    const user = await this.authService.getUserByToken(token);
    if (!user) {
      response.status(401).json({ message: "Invalid auth token" });
      return;
    }

    const friendUserId = getParam(request, "friendUserId");
    try {
      if (request.method === "GET") {
        response.json({ messages: await this.authService.listDirectMessages(user.id, friendUserId) });
        return;
      }

      response.status(201).json({
        messages: await this.authService.sendDirectMessage(user.id, friendUserId, {
          content: String(request.body?.content || ""),
          fileName: request.body?.fileName,
          fileUrl: request.body?.fileUrl,
        }),
      });
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Could not access direct messages",
      });
    }
  };
}
