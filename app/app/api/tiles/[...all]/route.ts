// app/api/tiles/[...all]/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from 'fs';
import path from 'path';

const TILE_BASE_PATH = path.join(process.cwd(), 'public', 'tiles');

const CONVERT_Y_TO_TMS = true;

export async function GET(
    req: NextRequest,
    { params }: { params: { all: string[] } }
) {
    const pathSegments = params.all;

    console.log(`TILE API - Request Received /api/tiles/${pathSegments.join('/')}`);

    if (pathSegments.length !== 4){
        return new NextResponse('Invalid tile URL format. Expected /api/tiles/{id}/{z}/{x}/{y}.png', { status: 400 });
    }

    if (!TILE_BASE_PATH){
        console.error('[TILE API - ERROR] TILE_STORAGE_PATH env var is not set');
        return new NextResponse('Tile storage path is not found or configured correctly.', { status: 500 });
    }

    const [fullId, zStr, xStr, yPng] = pathSegments
    const yStr = path.parse(yPng).name;
    console.log(`[TILE - DATA] y raw from front end ${yPng}`)

    let yToUse: number;
    let finalFilePath: string;

    try{
        const z = parseInt(zStr, 10);
        const y = parseInt(yStr, 10);

        yToUse = CONVERT_Y_TO_TMS ? (1 << z) - 1 - y : y;
        console.log(`[TILE - DATA] y tms transformed ${yToUse}`)

        finalFilePath = path.join(
            TILE_BASE_PATH,
            `${fullId}`,
            zStr,
            xStr,
            `${yToUse}.png`
        );

        console.log(`[TILE API - Reading] Attempting to read file: ${finalFilePath}`);

        const fileBuffer = fs.readFileSync(finalFilePath);

        console.log(`[TILE API - SUCCESS] Successfully read ${finalFilePath}. Sending image to browser.`);
        return new NextResponse(fileBuffer, {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
        });
    } catch (error: any) {
        console.error(`[TILE API - FAILED] Error reading file. Error code: ${error.code}`);
        return new NextResponse(`Tile not found on server `, { status: 400 });
    }
}