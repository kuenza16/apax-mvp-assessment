import { model, Schema, type Types } from "mongoose";
import { METAL_ASSET_TYPES, type MetalAssetType } from "../types/api";

export interface IHolding {
  user: Types.ObjectId;
  assetType: MetalAssetType;
  amount: number;
  createdAt: Date;
  updatedAt: Date;
}

const holdingSchema = new Schema<IHolding>({
  user: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  assetType: { type: String, required: true, enum: METAL_ASSET_TYPES },
  amount: {
    type: Number,
    required: true,
    min: 0,
    validate: { validator: Number.isFinite, message: "Amount must be finite" },
  },
}, { timestamps: true });

holdingSchema.index({ user: 1, assetType: 1 }, { unique: true });

export default model<IHolding>("Holding", holdingSchema);
