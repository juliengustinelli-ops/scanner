import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  getDonationsWithDonors,
  createDonation,
} from "@/lib/models/donations";
import { getDonorById } from "@/lib/models/donors";

// GET /api/donations - Get all donations with donor info
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");

    const donations = await getDonationsWithDonors(limit);

    return NextResponse.json(donations);
  } catch (error) {
    console.error("Error fetching donations:", error);
    return NextResponse.json(
      { error: "Failed to fetch donations" },
      { status: 500 }
    );
  }
}

// POST /api/donations - Create a new donation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    const { donorId, amount, method } = body;
    if (!donorId || amount === undefined || !method) {
      return NextResponse.json(
        { error: "Missing required fields: donorId, amount, method" },
        { status: 400 }
      );
    }

    // Verify donor exists
    const donor = await getDonorById(donorId);
    if (!donor) {
      return NextResponse.json(
        { error: "Donor not found" },
        { status: 404 }
      );
    }

    // Create donation
    const donation = await createDonation({
      donorId: new ObjectId(donorId),
      amount: parseFloat(amount),
      date: body.date ? new Date(body.date) : new Date(),
      method,
      checkNumber: body.checkNumber,
      scannedBy: body.scannedBy || "system",
      notes: body.notes,
    });

    return NextResponse.json(donation, { status: 201 });
  } catch (error) {
    console.error("Error creating donation:", error);
    return NextResponse.json(
      { error: "Failed to create donation" },
      { status: 500 }
    );
  }
}
