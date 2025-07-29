import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid'; 
import { SubstationData, ComponentPolygon } from './types'; // IMPORT types

const dataDir = path.join(process.cwd(), 'app/data');
const substationsPath = path.join(dataDir, 'substations.json');
const polygonsPath = path.join(dataDir, 'component_polygons.json');

// Helper to ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Helper to read a JSON file safely
async function readJsonFile<T>(filePath: string): Promise<T[]> {
    try {
        await ensureDataDir();
        await fs.access(filePath);
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data) as T[];
    } catch (error) {
        // If file doesn't exist, return an empty array.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

// Functions to read data
export async function getSubstations(): Promise<SubstationData[]> {
  return readJsonFile<SubstationData>(substationsPath);
}

export async function getComponentPolygons(): Promise<ComponentPolygon[]> {
  return readJsonFile<ComponentPolygon>(polygonsPath);
}

// Functions to write data
export async function writeSubstations(data: SubstationData[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(substationsPath, JSON.stringify(data, null, 2));
}

export async function writeComponentPolygons(data: ComponentPolygon[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(polygonsPath, JSON.stringify(data, null, 2));
}

// --- New helper functions to replace direct db calls ---

export function generateId(): string {
  return uuidv4();
}