// app/api/polygons/route.ts
import { NextResponse } from 'next/server';
import { getComponentPolygons, writeComponentPolygons } from '@/lib/data';

// GET handler to fetch all polygons
export async function GET() {
  try {
    const polygons = await getComponentPolygons();
    return NextResponse.json(polygons);
  } catch (error) {
    return NextResponse.json({ message: 'Error reading polygons file' }, { status: 500 });
  }
}

// POST handler to update the polygons file
export async function POST(request: Request) {
  try {
    const body = await request.json();
    await writeComponentPolygons(body);
    return NextResponse.json({ message: 'Polygons updated successfully' });
  } catch (error) {
    return NextResponse.json({ message: 'Error writing polygons file' }, { status: 500 });
  }
}