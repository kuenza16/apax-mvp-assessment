import express from "express";
import cors from "cors";
import activityRoutes from "./routes/activity";
import balanceRoutes from "./routes/balance";
import userRoutes from "./routes/users";
import holdingsRoutes from "./routes/holdings";
import errorMiddleware from "./middlewares/helpers/errorMiddleware";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/activity", activityRoutes);
app.use("/balance", balanceRoutes);
app.use("/user", userRoutes);
app.use("/api/holdings", holdingsRoutes);
app.get("/", (_req, res) => {
  res.json({ message: "Backend is running!" });
});
app.use(errorMiddleware);

export default app;
