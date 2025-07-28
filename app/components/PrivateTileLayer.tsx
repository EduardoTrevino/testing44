"use client";

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// --- AWS S3 Client Setup (reads from .env.local) ---
const s3Client = new S3Client({
  region: process.env.NEXT_PUBLIC_AWS_S3_REGION,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!,
  },
});

const s3BucketName = process.env.NEXT_PUBLIC_S3_BUCKET_NAME!;

// Props for our component
interface PrivateTileLayerProps {
  urlTemplate: string; // e.g., "frontend/tiles/{full_id}/{z}/{x}/{y}.png"
  fullId: string;
}

// Helper function to get a signed URL for a specific tile
async function getSignedS3Url(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: s3BucketName,
    Key: key,
  });
  // The pre-signed URL will be valid for 15 minutes by default
  return getSignedUrl(s3Client, command);
}

// The main component
export default function PrivateTileLayer({ urlTemplate, fullId }: PrivateTileLayerProps) {
  const map = useMap();

  console.log(`PrivateTileLayer mounted with props: fullId=${fullId}, template=${urlTemplate}`);

  useEffect(() => {
    if (!map || !urlTemplate) return;

    console.log("useEffect triggered, created custom grid layer")

    // Extend Leaflet's GridLayer to create our custom logic
    const PrivateGridLayer = L.GridLayer.extend({
      createTile: function (coords: L.Coords, done: L.DoneCallback) {
        const tile = document.createElement('img');

        const tmsY = ((1 << coords.z) - 1 - coords.y);
        console.log(`TMSY!! ${tmsY}`);
        
        // Construct the S3 object key from the template and tile coordinates
        const key = urlTemplate
          .replace('{full_id}', fullId)
          .replace('{z}', coords.z.toString())
          .replace('{x}', coords.x.toString())
          .replace('{y}', tmsY.toString());

        console.log(`createdTile called for z:${coords.z}, x:${coords.x}, y:${coords.y}. Key ${key}`)
        // Asynchronously fetch the signed URL and then set the image source
        getSignedS3Url(key)
          .then(url => {
            console.log(`successfully got signed URL for key ${key}`);
            console.log(`URL: ${url}`)
            tile.src = url;
            tile.onload = () => {
                console.log(`Image loaded successfully for tile: ${key}`);
                done(undefined, tile)
            }; // Signal Leaflet that the tile is ready
            tile.onerror = () => {
              // Optional: handle missing tiles gracefully
              console.error(`image FAILED to load from signed URL for key: ${key}`);
              tile.style.display = 'none';
              done(undefined, tile);
            };
          })
          .catch(error => {
            console.error(`Failed to get signed URL for ${key}:`, error);
            done(error as Error, tile);
          });

        return tile; // Return the image element immediately
      }
    });

    const layer = new (PrivateGridLayer as any)({
        maxNativeZoom: 22, // Set to your tiles' max zoom
        maxZoom: 22,
        minZoom: 11, // Optional: prevent zooming too far out
        zIndex: 2
    });
    
    layer.addTo(map);

    // Cleanup function to remove the layer when the component unmounts or props change
    return () => {
      map.removeLayer(layer);
    };
  }, [map, urlTemplate, fullId]); // Re-run if the map, template, or ID changes

  return null; // This component doesn't render any visible JSX itself
}