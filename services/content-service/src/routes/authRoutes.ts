import { Router } from "express";
import { AuthController } from "../controllers/authController";

export const createAuthRouter = (controller: AuthController) => {
  const router = Router();

  router.post("/auth/register", controller.register);
  router.post("/auth/login", controller.login);
  router.get("/auth/me", controller.me);
  router.get("/auth/settings", controller.settings);
  router.patch("/auth/settings", controller.settings);
  router.patch("/auth/account", controller.account);
  router.get("/auth/directory", controller.directory);
  router.post("/auth/friends", controller.connectFriend);
  router.post("/auth/friend-requests", controller.createFriendRequest);
  router.patch("/auth/friend-requests/:requestId", controller.respondToFriendRequest);
  router.get("/auth/direct-messages/:friendUserId", controller.directMessages);
  router.post("/auth/direct-messages/:friendUserId", controller.directMessages);

  return router;
};
