import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["citizen", "bank_officer", "police_officer", "cyber_analyst", "admin"],
      default: "citizen",
    },
    phone: { type: String },
    organisation: { type: String }, // bank name / police station / agency, if applicable
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    resetToken: { type: String },
    resetTokenExpiresAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
