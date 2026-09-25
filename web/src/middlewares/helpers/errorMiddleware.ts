import type { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import ErrorHandler from "../../utils/errorHandler";

const errorMiddleware: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof ErrorHandler && error.statusCode >= 400 && error.statusCode < 500) {
    res.status(error.statusCode).json({ success: false, message: error.message });
    return;
  }
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ success: false, message: "Invalid JSON request body" });
    return;
  }
  if (error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ success: false, message: "Invalid request details" });
    return;
  }
  if (error?.code === 11000) {
    res.status(409).json({ success: false, message: "Record already exists" });
    return;
  }
  res.status(500).json({ success: false, message: "Internal server error" });
};

export default errorMiddleware;
