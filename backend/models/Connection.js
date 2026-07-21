import mongoose from "mongoose";

const connectionSchema = new mongoose.Schema(
  {
    source: { type: mongoose.Schema.Types.ObjectId, ref: "FraudEntity", required: true },
    target: { type: mongoose.Schema.Types.ObjectId, ref: "FraudEntity", required: true },
    relationship: {
      type: String,
      enum: ["used_by", "transacted_with", "same_ring", "victim_of", "cash_out_to"],
      required: true,
    },
    evidenceComplaint: { type: mongoose.Schema.Types.ObjectId, ref: "Complaint" },
    weight: { type: Number, default: 1 }, // number of corroborating reports
  },
  { timestamps: true }
);

connectionSchema.index({ source: 1, target: 1, relationship: 1 }, { unique: true });

export default mongoose.model("Connection", connectionSchema);
