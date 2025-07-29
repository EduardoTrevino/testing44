// app/api/substations/route.ts
import { NextResponse } from 'next/server';
import { getSubstations, writeSubstations } from '@/lib/data';

// GET handler to fetch all substations
export async function GET() {
  try {
    const substations = await getSubstations();
    return NextResponse.json(substations);
  } catch (error) {
    return NextResponse.json({ message: 'Error reading substations file' }, { status: 500 });
  }
}

// POST handler to update the substations file
export async function POST(request: Request) {
  try {
    const body = await request.json();
    await writeSubstations(body);
    return NextResponse.json({ message: 'Substations updated successfully' });
  } catch (error) {
    return NextResponse.json({ message: 'Error writing substations file' }, { status: 500 });
  }
}