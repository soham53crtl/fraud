import mongoose from "mongoose";

const evidenceSchema = new mongoose.Schema(
  {
    complaint: { type: mongoose.Schema.Types.ObjectId, ref: "Complaint" },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["screenshot", "audio", "pdf", "other"], required: true },
    url: { type: String, required: true }, // Cloudinary secure_url
    publicId: { type: String }, // Cloudinary public_id, for deletion
    extractedText: { type: String }, // OCR / speech-to-text output
    mimeType: { type: String },
    sizeBytes: { type: Number },
  },
  { timestamps: true }
);

export default mongoose.model("Evidence", evidenceSchema);
