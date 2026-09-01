import type { RequestHandler } from "express";
import { getAccountRoutingState } from "../services/account-routing.service";

export const getAccountState: RequestHandler = async (req, res, next) => {
  const user = req.authenticatedUser;
  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid authentication session is required." } });
    return;
  }

  try {
    res.status(200).json({ data: await getAccountRoutingState(user.id) });
  } catch (error) {
    next(error);
  }
};
