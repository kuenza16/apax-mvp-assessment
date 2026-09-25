import { Response } from "express";
import { IUser } from "../models/userModel";

// Explicit allowlist: never serialize a password-bearing Mongoose document.
export const publicUser = (user: IUser) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
});

const sendToken = (user: IUser, statusCode: number, res: Response) => {
  res.status(statusCode).json({
    success: true,
    token: user.getJWTToken(),
    user: publicUser(user),
  });
};

export default sendToken;
