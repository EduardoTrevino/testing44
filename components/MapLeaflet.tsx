"use client";

import React, { useEffect } from "react";
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

export interface ComponentPolygon {
  id: string;
  substation_id: string | null;
  label: string;
  confirmed?: boolean;
  geometry: {
    type: string;
    coordinates: any;
  };
  created_at: string;
  substation_full_id?: string;
  from_osm: boolean;
}

const LABEL_COLORS: Record<string, string> = {
  "Power Compensator": "#00AAFF", // cyan-blue
  "Power Transformer": "#FF00AA", // magenta-pink
  "Power Generator": "#FFD700",   // gold
  "Power Line": "#ffa500",        // orange
  "Power Plant": "#800080",       // purple
  "Power Switch": "#DC143C",      // crimson red
  "Power Tower": "#0000FF",       // blue
};

/**
 * Only run fit-bounds when substation changes, not on every polygon toggle.
 */
function FitBoundsToSubstation({
  polygons,
  substationId,
}: {
  polygons: ComponentPolygon[];
  substationId: string;
}) {
  const map = useMap();

  useEffect(() => {
    // On substation change, find the "power_substation_polygon"
    const subPoly = polygons.find((p) => p.label === "power_substation_polygon");
    if (!subPoly || subPoly.geometry?.type !== "Polygon") return;

    const ring = subPoly.geometry.coordinates[0];
    if (!ring || ring.length === 0) return;

    const latlngs = ring.map(([lng, lat]: [number, number]) => [lat, lng]);
    const bounds = L.latLngBounds(latlngs);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [substationId]); // << Only runs when substationId changes

  return null;
}

// Utility conversions
function convertPolygonRing(ring: number[][]) {
  return ring.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
}
function convertLineCoords(coords: number[][]) {
  return coords.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
}
function convertPointCoord(coords: number[]) {
  return [coords[1], coords[0]] as L.LatLngTuple;
}

/**
 * Renders each polygon/line/point with the desired style.
 *  - from_osm => not clickable, show a tooltip with `label` on hover
 *  - user polygons => clickable (if you want) to open edit dialog
 *  - newly drawn => color = yellow
 *  - substation boundary => red, no click
 */
function renderFeature(
  poly: ComponentPolygon,
  onPolygonClicked?: (p: ComponentPolygon) => void
) {
  const { geometry, label, confirmed, from_osm, id } = poly;
  const isNewShape = id.startsWith("temp-");

  // Substation boundary: red outline, not interactive
  if (label === "power_substation_polygon") {
    if (geometry.type === "Polygon") {
      const outerRing = geometry.coordinates[0] || [];
      const latlngs = convertPolygonRing(outerRing);
      return (
        <Polygon
          key={id}
          pathOptions={{ color: "red", fill: false, weight: 2, interactive: false }}
          positions={latlngs}
        />
      );
    }
    return null;
  }

  // Choose color
  let color = "green";
  if (confirmed) {
    color = "green";
  } else if (isNewShape) {
    color = "green";
  } else {
    color = LABEL_COLORS[label] || "green";
  }

  // If from_osm => no clicks, just a tooltip
  // If user polygon => clickable => pass up onPolygonClicked
  const eventHandlers = from_osm
    ? {}
    : { click: () => onPolygonClicked?.(poly) };

  // All polygons show a tooltip on hover with the label
  // (Leaflet <Tooltip> defaults to show on hover)
  switch (geometry.type) {
    case "Polygon": {
      const outerRing = geometry.coordinates[0] || [];
      const latlngs = convertPolygonRing(outerRing);
      return (
        <Polygon
          key={id}
          pathOptions={{ color, fill: false, weight: 3 }}
          positions={latlngs}
          eventHandlers={eventHandlers}
        >
          <Tooltip direction="auto" sticky>
            {label}
          </Tooltip>
        </Polygon>
      );
    }
    case "LineString": {
      const coords = geometry.coordinates || [];
      const latlngs = convertLineCoords(coords);
      return (
        <Polyline
          key={id}
          pathOptions={{ color, weight: 3 }}
          positions={latlngs}
          eventHandlers={eventHandlers}
        >
          <Tooltip direction="auto" sticky>
            {label}
          </Tooltip>
        </Polyline>
      );
    }
    case "Point": {
      const coords = geometry.coordinates || [];
      const latlng = convertPointCoord(coords);
      return (
        <CircleMarker
          key={id}
          center={latlng}
          pathOptions={{ color, fillColor: color, fillOpacity: 1 }}
          radius={5}
          eventHandlers={eventHandlers}
        >
          <Tooltip direction="auto" sticky>
            {label}
          </Tooltip>
        </CircleMarker>
      );
    }
    default:
      return null;
  }
}

interface MapLeafletProps {
  polygons: ComponentPolygon[];
  onPolygonCreated?: (geojson: any) => void;
  onPolygonClicked?: (poly: ComponentPolygon) => void;
}

export default function MapLeaflet({
  polygons,
  onPolygonCreated,
  onPolygonClicked,
}: MapLeafletProps) {
  // Called when user draws a new shape
  function handleCreated(e: any) {
    const geojson = e.layer.toGeoJSON();
    onPolygonCreated?.(geojson);
  }

  // Identify substation ID so we can re‐fit only on substation change
  const subPoly = polygons.find((p) => p.label === "power_substation_polygon");
  const substationId = subPoly?.substation_id || "no_substation";

  // Build legend
  const presentLabels = Array.from(
    new Set(
      polygons.filter((p) => p.label !== "power_substation_polygon").map((p) => p.label)
    )
  );
// Unoffical google tile (NOTE YOU CAN GET BANNED AND IS AGAINST THEIR TOS: https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z})
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <MapContainer style={{ width: "100%", height: "100%" }} maxZoom={24}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution=""
          maxNativeZoom={19}
          maxZoom={24}
        />
/
        {/* Fit bounds only on substation change */}
        <FitBoundsToSubstation polygons={polygons} substationId={substationId} />

        {/* Render each feature */}
        {polygons.map((poly) => renderFeature(poly, onPolygonClicked))}
        {/* change to allow market, line, rectangle, circle etc. */}
        <FeatureGroup>
          <EditControl
            position="topright"
            draw={{
              polygon: {
                shapeOptions: {
                  fill: false,       // Disable any fill color
                  color: "green",  // Outline color (pick whatever you like)
                  weight: 2,
                },
              },
              marker: false,
              polyline: false,
              rectangle: false,
              circle: false,
              circlemarker: false,
            }}
            edit={{
              edit: false,
              remove: false,
            }}
            onCreated={handleCreated}
          />
        </FeatureGroup>
      </MapContainer>

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          zIndex: 9999,
          bottom: 10,
          left: 10,
          background: "rgba(255,255,255,0.75)",
          padding: "8px",
          borderRadius: "4px",
          boxShadow: "0 0 4px rgba(0,0,0,0.3)",
          fontSize: "0.85rem",
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: "4px" }}>Legend</div>

        {presentLabels.map((lbl) => {
          const clr = LABEL_COLORS[lbl] || "green";
          return (
            <div
              key={lbl}
              style={{ display: "flex", alignItems: "center", marginBottom: 4 }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  background: clr,
                  border: `2px solid ${clr}`,
                  marginRight: 6,
                }}
              />
              {lbl}
            </div>
          );
        })}

        <div style={{ display: "flex", alignItems: "center", marginTop: 6 }}>
          <div
            style={{
              width: 16,
              height: 16,
              border: "2px solid red",
              marginRight: 6,
            }}
          />
          Substation Boundary
        </div>
      </div>
    </div>
  );
}
