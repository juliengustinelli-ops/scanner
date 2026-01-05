import { NextRequest, NextResponse } from "next/server";
import {
  getDonorById,
  updateDonor,
  deleteDonor,
} from "@/lib/models/donors";
import { getDonationsByDonor } from "@/lib/models/donations";

type Params = Promise<{ id: string }>;

// GET /api/donors/[id] - Get a single donor with their donations
export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { id } = await params;
    const donor = await getDonorById(id);

    if (!donor) {
      return NextResponse.json(
        { error: "Donor not found" },
        { status: 404 }
      );
    }

    // Include donation history
    const donations = await getDonationsByDonor(id);

    return NextResponse.json({ ...donor, donations });
  } catch (error) {
    console.error("Error fetching donor:", error);
    return NextResponse.json(
      { error: "Failed to fetch donor" },
      { status: 500 }
    );
  }
}

// PUT /api/donors/[id] - Update a donor
export async function PUT(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const donor = await updateDonor(id, {
      name: body.name,
      address: body.address,
      envelopeNumber: body.envelopeNumber,
      phone: body.phone,
      email: body.email,
    });

    if (!donor) {
      return NextResponse.json(
        { error: "Donor not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(donor);
  } catch (error) {
    console.error("Error updating donor:", error);
    return NextResponse.json(
      { error: "Failed to update donor" },
      { status: 500 }
    );
  }
}

// DELETE /api/donors/[id] - Delete a donor
export async function DELETE(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { id } = await params;
    const deleted = await deleteDonor(id);

    if (!deleted) {
      return NextResponse.json(
        { error: "Donor not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting donor:", error);
    return NextResponse.json(
      { error: "Failed to delete donor" },
      { status: 500 }
    );
  }
}
