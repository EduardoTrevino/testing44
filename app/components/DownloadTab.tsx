"use client";

import React, { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";


// Almost all standard web tile services use EPSG:3857 (Web Mercator).

// Leaflet defaults to that same EPSG:3857 for display.

// The actual GeoJSON coordinates that Leaflet collects are typically stored in [longitude, latitude] pairs (WGS84, effectively EPSG:4326).
export default function DownloadTab() {
  const [downloading, setDownloading] = useState(false);

  // Fetch complete substations and their component polygons
  async function fetchCompleteAnnotations() {
    const supabase = getSupabaseClient();
    // 1. Get complete substations
    let { data: completeSubs, error: subError } = await supabase
      .from("substations")
      .select("*")
      .eq("completed", true);
    if (subError) throw subError;
    if (!completeSubs) completeSubs = [];
    // Extract an array of substation ids
    const completeIds = completeSubs.map((sub: any) => sub.id);

    // 2. Get component_polygons that belong to these complete substations.
    let { data: annotations, error: annError } = await supabase
      .from("component_polygons")
      .select("*")
      .in("substation_uuid", completeIds)
      .eq("from_osm", false);
    if (annError) throw annError;
    if (!annotations) annotations = [];
    return { completeSubs, annotations };
  }

  // Helper: force download a file in browser
  function downloadFile(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Option 1: Download CSV
  async function handleDownloadCSV() {
    setDownloading(true);
    try {
      const { annotations } = await fetchCompleteAnnotations();
      // Build CSV header
      const header = [
        "id",
        "substation_uuid",
        "substation_full_id",
        "label",
        "confirmed",
        "created_at",
        "geometry",
      ];
      const csvRows = [header.join(",")];

      for (const ann of annotations) {
        // To avoid CSV issues, replace commas in text fields.
        const row = [
          ann.id,
          ann.substation_uuid || "",
          ann.substation_full_id || "",
          (ann.label || "").replace(/,/g, " "),
          ann.confirmed ? "true" : "false",
          ann.created_at,
          JSON.stringify(ann.geometry).replace(/,/g, ";"),
        ];
        csvRows.push(row.join(","));
      }
      downloadFile("annotations.csv", csvRows.join("\n"), "text/csv");
    } catch (e: any) {
      console.error(e);
      alert("Error downloading CSV: " + e.message);
    }
    setDownloading(false);
  }

  // Option 2: Download JSON (raw annotations)
  async function handleDownloadJSON() {
    setDownloading(true);
    try {
      const { annotations } = await fetchCompleteAnnotations();
      const jsonString = JSON.stringify(annotations, null, 2);
      downloadFile("annotations.json", jsonString, "application/json");
    } catch (e: any) {
      console.error(e);
      alert("Error downloading JSON: " + e.message);
    }
    setDownloading(false);
  }

  // Option 3: Download COCO-format JSON (simplified)
  async function handleDownloadCOCO() {
    setDownloading(true);
    try {
      const { completeSubs, annotations } = await fetchCompleteAnnotations();

      // Build "images" array from complete substations.
      // Each image gets an id (using full_id if available; fallback to substation id)
      const images = completeSubs.map((sub: any, idx: number) => ({
        id: sub.full_id || sub.id,
        file_name: sub.name || `Substation_${idx}`,
        // Optionally add width/height if available.
      }));

      // Build categories: get distinct labels from annotations.
      const categoryMap: Record<string, number> = {};
      let nextCatId = 1;
      annotations.forEach((ann: any) => {
        if (ann.label && !categoryMap[ann.label]) {
          categoryMap[ann.label] = nextCatId++;
        }
      });
      const categories = Object.entries(categoryMap).map(([name, id]) => ({
        id,
        name,
      }));

      // Build annotations array.
      let annId = 1;
      const cocoAnnotations = annotations.map((ann: any) => {
        let segmentation: number[][] = [];
        let bbox: number[] = [];
        let area = 0;
        if (ann.geometry && ann.geometry.type === "Polygon") {
          // Use the first polygon ring
          segmentation = [ann.geometry.coordinates[0].flat()];
          // Compute bounding box: [minX, minY, width, height]
          const coords = ann.geometry.coordinates[0];
          const xs = coords.map((c: number[]) => c[0]);
          const ys = coords.map((c: number[]) => c[1]);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);
          bbox = [minX, minY, maxX - minX, maxY - minY];
          area = (maxX - minX) * (maxY - minY);
        }
        return {
          id: annId++,
          image_id: ann.substation_full_id || ann.substation_uuid,
          category_id: categoryMap[ann.label] || 0,
          segmentation,
          bbox,
          area,
          iscrowd: 0,
        };
      });

      const coco = {
        images,
        annotations: cocoAnnotations,
        categories,
      };

      const cocoString = JSON.stringify(coco, null, 2);
      downloadFile("annotations_coco.json", cocoString, "application/json");
    } catch (e: any) {
      console.error(e);
      alert("Error downloading COCO: " + e.message);
    }
    setDownloading(false);
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Download Completed Annotations</h2>
      <p className="text-sm text-gray-700 mb-4">
        Download annotations for substations marked as complete.
      </p>
      <div className="flex gap-4">
        <Button onClick={handleDownloadCSV} disabled={downloading}>
          {downloading ? "Downloading..." : "Download CSV"}
        </Button>
        <Button onClick={handleDownloadJSON} disabled={downloading}>
          {downloading ? "Downloading..." : "Download JSON"}
        </Button>
        <Button onClick={handleDownloadCOCO} disabled={downloading}>
          {downloading ? "Downloading..." : "Download COCO"}
        </Button>
      </div>
    </div>
  );
}
