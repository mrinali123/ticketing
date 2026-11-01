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
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  },
);

const User = mongoose.model('User', userSchema);

export default User;
