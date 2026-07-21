import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // null = broadcast to a role room
    recipientRole: { type: String }, // e.g. "police_officer" — used when broadcasting
    title: { type: String, required: true },
    body: { type: String },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },
    relatedComplaint: { type: mongoose.Schema.Types.ObjectId, ref: "Complaint" },
    readAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Notification", notificationSchema);
