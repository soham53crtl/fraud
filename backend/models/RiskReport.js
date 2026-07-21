import mongoose from "mongoose";

const riskReportSchema = new mongoose.Schema(
  {
    complaint: { type: mongoose.Schema.Types.ObjectId, ref: "Complaint", required: true },
    modelUsed: { type: String, default: "fraud-risk-engine-v1" },
    inputTextHash: { type: String }, // sha256 of input, for de-duplication/audit without storing PII twice
    riskScore: { type: Number, min: 0, max: 100 },
    riskBand: { type: String, enum: ["LOW", "GUARDED", "ELEVATED", "CRITICAL"] },
    category: { type: String },
    confidence: { type: Number, min: 0, max: 100 },
    reasoning: [{ label: String, weight: Number }],
    similarPatternIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Complaint" }],
    legalGuidance: { type: String },
    processingMs: { type: Number },
  },
  { timestamps: true }
);

export default mongoose.model("RiskReport", riskReportSchema);
