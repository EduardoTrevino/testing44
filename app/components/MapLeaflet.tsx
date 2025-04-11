"use client";

import React, { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  FeatureGroup,
  Polygon,
  Polyline,
  CircleMarker,
  useMap,
  Tooltip,
} from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { ScrollArea } from "@/components/ui/scroll-area"; // Import if using shadcn ScrollArea for legend

// Interface matching AnnotateTab.tsx
export interface ComponentPolygon {
  id: string;
  substation_id: string | null;
  substation_uuid?: string | null; // Use if this field name is used
  label: string;
  geometry: {
    type: string;
    coordinates: any;
  };
  created_at: string;
  substation_full_id?: string;
  from_osm: boolean;
  additional_info?: string | null; // Include for tooltips
  annotation_by?: string | null;
  confirmed?: boolean;
}

const LABEL_COLORS: Record<string, string> = {
  "Power Compensator": "#00AAFF", // cyan-blue
  "Power Transformer": "#FF00AA", // magenta-pink
  "Power Generator": "#FFD700",   // gold
  "Power Line": "#ffa500",        // orange
  "Power Plant": "#800080",       // purple
  "Power Switch": "#DC143C",      // crimson red
  "Power Tower": "#0000FF",       // blue
  "Circuit switch": "#ff4500",     // orange-red
  "Circuit breaker": "#adff2f",   // green-yellow
  "High side power area": "#8a2be2",// blue-violet
  "Capacitor bank": "#00ced1",    // dark turquoise
  "Battery bank": "#ff69b4",      // hot pink
  "Bus bar": "#7fff00",           // chartreuse
  "Control house": "#d2691e",      // chocolate
  "Spare equipment": "#6495ed",   // cornflower blue
  "Vehicles": "#ff1493",          // deep pink
  "Tripolar disconnect switch": "#1e90ff", // dodger blue
  "Recloser": "#228b22",          // forest green
  "Fuse disconnect switch": "#ffd700",   // gold (duplicate, consider changing)
  "Closed blade disconnect switch": "#ff8c00", // dark orange
  "Current transformer": "#9932cc", // dark orchid
  "Open blade disconnect switch": "#e9967a", // dark salmon
  "Closed tandem disconnect switch": "#8fbc8f", // dark sea green
  "Open tandem disconnect switch": "#483d8b", // dark slate blue
  "Lightning arrester": "#2f4f4f", // dark slate gray
  "Glass disc insulator": "#00bfff", // deep sky blue
  "Potential transformer": "#9400d3", // dark violet
  "Muffle": "#ff6347", // tomato
  // Add more as needed
};

// --- Utility Components ---

function FitBoundsToSubstation({
  polygons,
  substationId, // Using ID as the key dependency
}: {
  polygons: ComponentPolygon[];
  substationId: string;
}) {
  const map = useMap();

  useEffect(() => {
    const subPoly = polygons.find((p) => p.label === "power_substation_polygon");
    if (!subPoly?.geometry || subPoly.geometry?.type !== "Polygon") return;

    const ring = subPoly.geometry.coordinates[0];
    if (!ring || ring.length < 3) return; // Need at least 3 points for bounds

    try {
        const latlngs = ring.map(([lng, lat]: [number, number]) => [lat, lng] as L.LatLngTuple);
        const bounds = L.latLngBounds(latlngs);
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [30, 30] }); // Slightly more padding
        }
    } catch (error) {
         console.error("Error creating bounds for substation:", error);
    }

  }, [substationId, map]); // Depend on substationId and map instance

  return null;
}

function MapInvalidator({ isFullscreen }: { isFullscreen?: boolean }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150); // Slightly longer delay might help complex layouts
    return () => clearTimeout(timer);
  }, [isFullscreen, map]); // Depend on fullscreen state and map

  return null;
}

// --- Geometry Conversion ---
function convertPolygonRing(ring: number[][]): L.LatLngTuple[] {
  return ring.map(([lng, lat]) => [lat, lng]);
}
function convertLineCoords(coords: number[][]): L.LatLngTuple[] {
  return coords.map(([lng, lat]) => [lat, lng]);
}
function convertPointCoord(coords: number[]): L.LatLngTuple {
  return [coords[1], coords[0]];
}

// --- Feature Rendering ---
function renderFeature(
  poly: ComponentPolygon,
  onPolygonClicked?: (p: ComponentPolygon) => void
) {
  const { geometry, label, from_osm, id, additional_info } = poly;

  // Substation boundary: specific style, not interactive for clicks
  if (label === "power_substation_polygon") {
    if (geometry.type === "Polygon" && geometry.coordinates?.[0]) {
      const latlngs = convertPolygonRing(geometry.coordinates[0]);
      return (
        <Polygon
          key={id}
          pathOptions={{ color: "red", fill: false, weight: 2, interactive: false, dashArray: '5, 5' }} // Dashed line
          positions={latlngs}
        />
      );
    }
    return null;
  }

  // --- Determine base color based on label, regardless of origin ---
  const fallbackColor = "#32CD32"; // Grey fallback for unknown labels
  const color = LABEL_COLORS[label] || fallbackColor;

  // --- Determine other styles based on origin (user vs OSM) ---
  const isUserAnnotated = !from_osm;
  const weight = isUserAnnotated ? 4 : 2;         // Thicker for user annotations
  const fill = isUserAnnotated ? true : false;    // Fill user shapes slightly
  const fillOpacity = isUserAnnotated ? 0.1 : 0;  // Very light fill for user shapes
  const dashArray = isUserAnnotated ? undefined : '4, 4'; // Dashed line for OSM features

  // Event handlers: only allow clicks on user-annotated features
  const eventHandlers = isUserAnnotated && onPolygonClicked
    ? { click: () => onPolygonClicked(poly) }
    : {};

   // --- Tooltip content Logic ---
   let primaryDisplay: string;
   const infoText = additional_info?.trim() || "";
 
   if (label === "Other" && infoText) {
       // If label is "Other" and there's info, use info as primary (truncated)
       primaryDisplay = infoText.substring(0, 40) + (infoText.length > 40 ? "..." : "");
   } else if (label) {
       // Otherwise, use the actual label as primary
       primaryDisplay = label;
   } else {
       // Fallback if no label and (it's not "Other" or info is empty)
       primaryDisplay = "Unlabeled";
   }
 
   // Construct the full tooltip, potentially adding full additional info if different from primary
   let tooltipContent = primaryDisplay;
   if (infoText && infoText !== primaryDisplay) {
       // Append the full additional info if it exists and wasn't already fully shown as the primary display
       tooltipContent += ` - ${infoText}`;
   }
 
   if (from_osm) {
       tooltipContent += ' (OSM)';
   }
   // --- End Tooltip Logic --

  try {
    switch (geometry.type) {
        case "Polygon": {
            if (!geometry.coordinates?.[0]) return null;
            const latlngs = convertPolygonRing(geometry.coordinates[0]);
            return (
            <Polygon
                key={id}
                // Apply styles determined above
                pathOptions={{ color, weight, fill, fillOpacity, dashArray }}
                positions={latlngs}
                eventHandlers={eventHandlers}
            >
                <Tooltip direction="auto" sticky>{tooltipContent}</Tooltip>
            </Polygon>
            );
        }
        case "LineString": {
            if (!geometry.coordinates) return null;
            const latlngs = convertLineCoords(geometry.coordinates);
            return (
            <Polyline
                key={id}
                // Apply styles (no fill for lines)
                pathOptions={{ color, weight, dashArray }}
                positions={latlngs}
                eventHandlers={eventHandlers}
            >
                <Tooltip direction="auto" sticky>{tooltipContent}</Tooltip>
            </Polyline>
            );
        }
        case "Point": {
            if (!geometry.coordinates) return null;
            const latlng = convertPointCoord(geometry.coordinates);
            // Point-specific styling adjustments
            const pointFillOpacity = isUserAnnotated ? 0.7 : 0.5;
            const pointRadius = isUserAnnotated ? 5 : 4;
            // DashArray doesn't apply well to points
            return (
            <CircleMarker
                key={id}
                center={latlng}
                pathOptions={{ color: color, weight: 1, fillColor: color, fillOpacity: pointFillOpacity }}
                radius={pointRadius}
                eventHandlers={eventHandlers}
            >
                <Tooltip direction="auto" sticky>{tooltipContent}</Tooltip>
            </CircleMarker>
            );
        }
        default:
            console.warn(`Unsupported geometry type: ${geometry.type} for feature ${id}`);
            return null;
    }
  } catch (error) {
      console.error(`Error rendering feature ${id} (${label}):`, error, geometry);
      return null; // Prevent crash on bad geometry
  }
}


// --- Main Map Component ---
interface MapLeafletProps {
  polygons: ComponentPolygon[];
  onPolygonCreated?: (geojson: any) => void;
  onPolygonClicked?: (poly: ComponentPolygon) => void;
  isMapFullscreen?: boolean;
}

export default function MapLeaflet({
  polygons,
  onPolygonCreated,
  onPolygonClicked,
  isMapFullscreen,
}: MapLeafletProps) {

  const handleCreated = (e: any) => {
    const layer = e.layer;
    const geojson = layer.toGeoJSON();
    onPolygonCreated?.(geojson);
    // Optionally remove the drawn layer immediately if AnnotateTab handles adding it back
    // e.layer.remove();
  };

  // Identify substation ID for FitBounds dependency
  // Use optional chaining and provide a fallback key
  const substationId = useMemo(() => {
      return polygons.find(p => p.label === 'power_substation_polygon')?.substation_id ?? 'no-substation-selected';
  }, [polygons]);


  // Build unique, sorted list of labels present in the current polygons (excluding boundary)
  const presentLabels = useMemo(() => {
        const labels = new Set<string>();
        polygons.forEach(p => {
            if (p.label && p.label !== 'power_substation_polygon') {
                labels.add(p.label);
            }
        });
        return Array.from(labels).sort((a, b) => a.localeCompare(b));
  }, [polygons]);


  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: '#f0f0f0' }}>
      <MapContainer
            style={{ width: "100%", height: "100%" }}
            center={[39.8283, -98.5795]} // Default center (e.g., US center)
            zoom={4} // Default zoom
            maxZoom={24}
            scrollWheelZoom={true} // Enable scroll wheel zoom
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution='Idaho National Laboratory'
          maxNativeZoom={19}
          maxZoom={24}
        />

        {/* Fit bounds only on substation change */}
        <FitBoundsToSubstation polygons={polygons} substationId={substationId} />

        {/* Render each feature */}
        {polygons.map((poly) => renderFeature(poly, onPolygonClicked))}

        {/* Drawing Controls */}
        <FeatureGroup>
          <EditControl
            position="topright"
            onCreated={handleCreated}
            draw={{
              polygon: {
                allowIntersection: false, // Prevent self-intersection
                shapeOptions: {
                  color: "#00ff00", // Bright green for drawing
                  weight: 2,
                  fill: true,
                  fillColor: "#00ff00",
                  fillOpacity: 0.1,
                },
                showArea: true,
                metric: true,
              },
              // Disable other drawing tools
              marker: false,
              circlemarker: false,
              polyline: false,
              rectangle: false,
              circle: false,
            }}
            edit={{
              featureGroup: new L.FeatureGroup(), // Empty group to disable editing toolbar
              edit: false,
              remove: false,
            }}
          />
        </FeatureGroup>

        {/* Component to invalidate size on fullscreen toggle */}
        <MapInvalidator isFullscreen={isMapFullscreen} />
      </MapContainer>

      {/* Legend - Conditionally render or style based on isMapFullscreen? */}
       {!isMapFullscreen && ( // Simple approach: hide legend in fullscreen
        <div
            style={{
            position: "absolute",
            zIndex: 1000, // Above map tiles, below dialogs/controls
            bottom: 10,
            left: 10,
            background: "rgba(255,255,255,0.85)",
            padding: "6px 8px",
            borderRadius: "5px",
            boxShadow: "0 1px 5px rgba(0,0,0,0.3)",
            fontSize: "11px", // Smaller font for legend
            maxWidth: "180px",
            }}
        >
            <div style={{ fontWeight: "bold", marginBottom: "3px", paddingBottom: '3px', borderBottom: '1px solid #ddd' }}>Legend</div>
            <div style={{ maxHeight: '150px', overflowY: 'auto', paddingRight: '4px' }}>
                {presentLabels.map((lbl) => {
                const clr = LABEL_COLORS[lbl] || "#3388ff"; // Use default blue
                return (
                    <div key={lbl} style={{ display: "flex", alignItems: "center", margin: "3px 0" }}>
                    <div
                        style={{
                        width: 12, height: 12, background: clr,
                        // Add a subtle border, especially helpful for lighter colors or against similar backgrounds
                        border: `1px solid rgba(0,0,0,0.2)`,
                        marginRight: 5, flexShrink: 0,
                        }}
                    />
                    <span style={{ wordBreak: 'break-word', lineHeight: '1.2' }}>{lbl}</span>
                    </div>
                );
                })}
                {presentLabels.length > 0 && (
                    <div style={{ height: '1px', backgroundColor: '#eee', margin: '3px 0'}} />
                )}
                <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
                <div style={{ width: 12, height: 12, border: "2px dashed red", marginRight: 5, flexShrink: 0 }}/>
                <span style={{ wordBreak: 'break-word', lineHeight: '1.2' }}>Boundary</span>
                </div>
            </div>
        </div>
       )}
    </div>
  );
}