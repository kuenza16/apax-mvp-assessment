import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User, { IUser } from "../../models/userModel";
import { getJWTConfig } from "../../config/auth";
import ErrorHandler from "../../utils/errorHandler";
import asyncErrorHandler from "../helpers/asyncErrorHandler";

export interface AuthenticatedRequest extends Request {
  user?: IUser;
}

export const isAuthenticatedUser = asyncErrorHandler(
  async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const header = req.get("authorization");
    if (!header) return next(new ErrorHandler("Authentication required", 401));
    const match = /^Bearer ([^\s]+)$/i.exec(header);
    if (!match) {
      return next(new ErrorHandler("Authorization must use Bearer <token>", 401));
    }
    const { secret } = getJWTConfig();
    let decoded;
    try {
      decoded = jwt.verify(match[1], secret, { algorithms: ["HS256"] });
    } catch (error) {
      return next(new ErrorHandler(
        error instanceof jwt.TokenExpiredError ? "Token expired" : "Invalid token", 401
      ));
    }
    if (typeof decoded !== "object" || typeof decoded.id !== "string" ||
        !mongoose.isObjectIdOrHexString(decoded.id) || typeof decoded.email !== "string") {
      return next(new ErrorHandler("Invalid token", 401));
    }
    const user = await User.findById(decoded.id);
    if (!user) return next(new ErrorHandler("Authentication required", 401));
    req.user = user;
    next();
  }
);

export const authorizeRoles =
  (...roles: string[]) =>
  (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ErrorHandler("Access forbidden", 403));
    }
    next();
  };
