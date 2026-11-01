// server/src/models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Please add a password'],
      select: false, // Never return password hash in queries by default
    },
    role: {
      type: String,
      enum: ['user', 'organiser'],
      default: 'user',
    },
    // Shown on events as the host, e.g. "Chennai Music Society". Set when becoming an organiser.
    organisationName: {
      type: String,
      trim: true,
      minlength: [2, 'Organisation name must be at least 2 characters'],
      maxlength: [80, 'Organisation name can be at most 80 characters'],
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  },
);

const User = mongoose.model('User', userSchema);

export default User;
