import { NextFunction, Request, Response } from "express";
import { AuthService } from "../services/authService";

export interface AuthenticatedLocals {
  user: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
  };
}

export const requireAuth = (authService: AuthService) => {
  return async (request: Request, response: Response, next: NextFunction) => {
    const value = request.headers.authorization;
    if (!value?.startsWith("Bearer ")) {
      response.status(401).json({ message: "Missing auth token" });
      return;
    }

    const token = value.slice(7);
    const user = await authService.getUserByToken(token);
    if (!user) {
      response.status(401).json({ message: "Invalid auth token" });
      return;
    }

    response.locals.user = user;
    next();
  };
};
