import { ObjectId } from "mongodb";
import { getDb } from "../mongodb";
import { User } from "@/types";

const COLLECTION = "users";

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  return db.collection<User>(COLLECTION).findOne({ email: email.toLowerCase() });
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDb();
  return db.collection<User>(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function createUser(
  user: Omit<User, "_id" | "createdAt">
): Promise<User> {
  const db = await getDb();
  const newUser: User = {
    ...user,
    email: user.email.toLowerCase(),
    createdAt: new Date(),
  };
  const result = await db.collection<User>(COLLECTION).insertOne(newUser);
  return { ...newUser, _id: result.insertedId };
}

export async function updateLastLogin(id: string): Promise<void> {
  const db = await getDb();
  await db.collection<User>(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { lastLogin: new Date() } }
  );
}

export async function getAllUsers(): Promise<Omit<User, "passwordHash">[]> {
  const db = await getDb();
  return db
    .collection<User>(COLLECTION)
    .find({}, { projection: { passwordHash: 0 } })
    .sort({ name: 1 })
    .toArray();
}

export async function deleteUser(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .collection<User>(COLLECTION)
    .deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount === 1;
}
