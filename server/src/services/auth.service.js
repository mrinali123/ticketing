import bcrypt from "bcrypt";
import User from "../models/User.js";
import jwt from "jsonwebtoken";  
export async function registerUser({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({ name, email, passwordHash });

  const userObj = user.toObject();
  delete userObj.passwordHash;
  return userObj;
}
export async function loginUser({ email, password }) {
  const user = await User.findOne({ email }).select("+passwordHash");

  const passwordOk = user && (await bcrypt.compare(password, user.passwordHash));

  if (!passwordOk) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    throw err;
  }

  const token = jwt.sign(
    { sub: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  return {
    token,
    user: { _id: user._id, name: user.name, email: user.email, role: user.role },
  };
}
export async function getMe(userId) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }
  return user;
}