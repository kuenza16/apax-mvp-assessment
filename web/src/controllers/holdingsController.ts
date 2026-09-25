import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middlewares/user_actions/auth";
import asyncErrorHandler from "../middlewares/helpers/asyncErrorHandler";
import Holding from "../models/holdingModel";
import type { Holdings, HoldingsResponse } from "../types/api";
import ErrorHandler from "../utils/errorHandler";

export const getHoldings = asyncErrorHandler(
  async (req: AuthenticatedRequest, res: Response<HoldingsResponse>, next: NextFunction) => {
    if (!req.user) return next(new ErrorHandler("Authentication required", 401));

    const records = await Holding.find({ user: req.user._id })
      .select("assetType amount -_id")
      .lean();
    const holdings: Holdings = { gold: 0, silver: 0, platinum: 0 };
    for (const record of records) holdings[record.assetType] = record.amount;

    res.json({ success: true, holdings });
  }
);
