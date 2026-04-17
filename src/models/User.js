const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    password: { type: String, default: null, select: false }, // null for Google OAuth users
    googleId: { type: String, default: null }, // null for email/password users
    avatar: { type: String, default: null },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    audienceLevel: { type: String, enum: ["patient", "clinician", "researcher"], default: "patient" },
    preferredTone: { type: String, enum: ["empathetic", "clinical", "educational"], default: "educational" },
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Never return password or googleId in JSON responses
userSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.googleId;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
