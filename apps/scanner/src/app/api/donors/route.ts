import { NextRequest, NextResponse } from "next/server";
import {
  getAllDonors,
  createDonor,
  searchDonors,
  getDonorByEnvelope,
} from "@/lib/models/donors";

// GET /api/donors - Get all donors or search
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const envelope = searchParams.get("envelope");

    // Search by envelope number
    if (envelope) {
      const donor = await getDonorByEnvelope(envelope);
      return NextResponse.json(donor);
    }

    // Search by query
    if (query) {
      const donors = await searchDonors(query);
      return NextResponse.json(donors);
    }

    // Get all donors
    const donors = await getAllDonors();
    return NextResponse.json(donors);
  } catch (error) {
    console.error("Error fetching donors:", error);
    return NextResponse.json(
      { error: "Failed to fetch donors" },
      { status: 500 }
    );
  }
}

// POST /api/donors - Create a new donor
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    const { name, address, envelopeNumber } = body;
    if (!name || !address || !envelopeNumber) {
      return NextResponse.json(
        { error: "Missing required fields: name, address, envelopeNumber" },
        { status: 400 }
      );
    }

    // Check if envelope number already exists
    const existing = await getDonorByEnvelope(envelopeNumber);
    if (existing) {
      return NextResponse.json(
        { error: "Envelope number already exists" },
        { status: 409 }
      );
    }

    // Create donor
    const donor = await createDonor({
      name,
      address,
      envelopeNumber,
      phone: body.phone,
      email: body.email,
    });

    return NextResponse.json(donor, { status: 201 });
  } catch (error) {
    console.error("Error creating donor:", error);
    return NextResponse.json(
      { error: "Failed to create donor" },
      { status: 500 }
    );
  }
}
