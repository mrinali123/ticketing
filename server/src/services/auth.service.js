import bcrypt from "bcrypt";
import User from "../models/User.js";

export async function registerUser({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({ name, email, passwordHash });

  const userObj = user.toObject();
  delete userObj.passwordHash;
  return userObj;
}