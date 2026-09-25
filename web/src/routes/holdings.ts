import { Router } from "express";
import { getHoldings } from "../controllers/holdingsController";
import { isAuthenticatedUser } from "../middlewares/user_actions/auth";

const router = Router();
router.get("/", isAuthenticatedUser, getHoldings);

export default router;
