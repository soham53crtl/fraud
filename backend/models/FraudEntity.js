import mongoose from "mongoose";

const fraudEntitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["phone", "bank_account", "upi_id", "wallet", "email", "ip_address", "victim"],
      required: true,
    },
    value: { type: String, required: true, index: true }, // e.g. the phone number or account number
    label: { type: String },
    riskLevel: { type: String, enum: ["low", "medium", "high", "confirmed"], default: "low" },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    relatedComplaints: [{ type: mongoose.Schema.Types.ObjectId, ref: "Complaint" }],
    metadata: { type: mongoose.Schema.Types.Mixed }, // e.g. { telecomCircle, bankName, vpnProvider }
  },
  { timestamps: true }
);

fraudEntitySchema.index({ type: 1, value: 1 }, { unique: true });

export default mongoose.model("FraudEntity", fraudEntitySchema);
