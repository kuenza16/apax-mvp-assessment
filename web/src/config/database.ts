import mongoose from "mongoose";

const connectDatabase = async (): Promise<void> => {
  const uri = process.env.MONGO_URI;
  if (!uri?.trim()) throw new Error("MONGO_URI is required");
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log("Mongoose connected");
  } catch {
    // Driver errors may contain connection details. Do not print credentials.
    throw new Error("MongoDB connection failed; check MONGO_URI and database availability");
  }
};

export default connectDatabase;
