import mongoose from "mongoose";

const complaintSchema = new mongoose.Schema(
  {
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    channel: {
      type: String,
      enum: ["sms", "whatsapp", "email", "url", "notice_pdf", "audio", "screenshot"],
      required: true,
    },
    rawContent: { type: String }, // pasted text, or extracted OCR/transcript text
    evidenceRefs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Evidence" }],

    // AI analysis result (contract shared with the risk engine)
    riskScore: { type: Number, min: 0, max: 100 },
    riskBand: { type: String, enum: ["LOW", "GUARDED", "ELEVATED", "CRITICAL"] },
    category: { type: String },
    confidence: { type: Number, min: 0, max: 100 },
    signals: [{ label: String, weight: Number }],
    recommendedActions: [String],

    status: {
      type: String,
      enum: ["new", "under_review", "escalated", "resolved", "false_positive"],
      default: "new",
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    linkedEntities: [{ type: mongoose.Schema.Types.ObjectId, ref: "FraudEntity" }],
    financialLoss: { type: Number, default: 0 },
    location: {
      state: String,
      district: String,
      lat: Number,
      lng: Number,
    },
  },
  { timestamps: true }
);

complaintSchema.index({ status: 1, createdAt: -1 });
complaintSchema.index({ "location.state": 1, "location.district": 1 });

export default mongoose.model("Complaint", complaintSchema);
