import { ObjectId } from "mongodb";

// Donor - represents a contributing family/individual
export interface Donor {
  _id?: ObjectId;
  name: string;
  address: string;
  envelopeNumber: string;
  phone?: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Donation - represents a single tithe contribution
export interface Donation {
  _id?: ObjectId;
  donorId: ObjectId;
  amount: number;
  date: Date;
  method: "cash" | "check" | "other";
  checkNumber?: string;
  scannedBy: string;
  notes?: string;
  createdAt: Date;
}

// User - represents a collector/admin who can log in
export interface User {
  _id?: ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  role: "admin" | "collector";
  createdAt: Date;
  lastLogin?: Date;
}

// For API responses - Donation with donor info populated
export interface DonationWithDonor extends Omit<Donation, "donorId"> {
  donor: Donor;
}

// Stats for dashboard
export interface CollectionStats {
  todayTotal: number;
  weekTotal: number;
  monthTotal: number;
  todayCount: number;
  totalDonors: number;
}
