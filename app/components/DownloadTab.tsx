"use client";

import React, { useState } from "react";
// REMOVED: import { getSupabaseClient } from "@/lib/supabase";
// import { getSubstations, getComponentPolygons } from "@/lib/data"; // IMPORTED
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast"; // Import useToast for feedback
import { SubstationData, ComponentPolygon } from './../lib/types'; // IMPORT types



export default function DownloadTab() {
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast(); // Initialize toast

  // Fetch complete substations and their component polygons from local files
  async function fetchCompleteAnnotations() {
    try {
      // 1. Get all substations from the JSON file
      const [substationsResponse, polygonsResponse] = await Promise.all([
        fetch('/api/substations'),
        fetch('/api/polygons')
      ]);

      if (!substationsResponse.ok) throw new Error('Failed to fetch substations');
      if (!polygonsResponse.ok) throw new Error('Failed to fetch polygons');

      const allSubstations: SubstationData[] = await substationsResponse.json();
      const allPolygons: ComponentPolygon[] = await polygonsResponse.json();
      
      // 2. Perform filtering logic in memory (no changes here)
      const completeSubs = allSubstations.filter(sub => sub.completed);

      if (completeSubs.length === 0) {
        return { completeSubs: [], annotations: [] };
      }

      const completeIds = completeSubs.map((sub) => sub.id);

      const annotations = allPolygons.filter(
        p => p.substation_uuid && completeIds.includes(p.substation_uuid) && !p.from_osm
      );

      return {
          completeSubs: completeSubs,
          annotations: annotations
      };
    } catch (error: any) {
        console.error("Error fetching annotations from files:", error);
        throw new Error(`Failed to fetch annotations for download: ${error.message}`);
    }
  }

  // Helper: force download a file in browser
  function downloadFile(filename: string, content: string, type: string) {
    try {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({ title: "Download Started", description: `${filename}` });
    } catch (error) {
         console.error("Download file error:", error);
         toast({ variant: "destructive", title: "Download Failed", description: "Could not initiate file download." });
    }
  }

  // Option 1: Download CSV
  async function handleDownloadCSV() {
    setDownloading(true);
    try {
      const { annotations } = await fetchCompleteAnnotations();

      if (annotations.length === 0) {
        toast({ variant: "destructive", title: "No Data", description: "No completed annotations found to download." });
        setDownloading(false);
        return;
      }

      // Build CSV header - include new fields, remove 'confirmed'
      const header = [
        "id",
        "substation_uuid",
        "substation_full_id",
        "label", // Standard component type ('Other' if custom)
        "additional_info", // Custom details, voltage, legacy labels etc.
        "annotation_by", // User who annotated
        "created_at",
        "geometry_wkt", // Use WKT for better CSV compatibility
      ];
      const csvRows = [header.join(",")];

      // Helper to convert GeoJSON geometry to WKT (simplified for Polygon/Point)
      const geojsonToWkt = (geometry: any): string => {
        try {
          if (!geometry || !geometry.type || !geometry.coordinates) return "";
          if (geometry.type === 'Polygon') {
            // Exterior ring only
            const coordsText = geometry.coordinates[0].map((p: number[]) => `${p[0]} ${p[1]}`).join(', ');
            return `POLYGON((${coordsText}))`;
          } else if (geometry.type === 'Point') {
            return `POINT(${geometry.coordinates[0]} ${geometry.coordinates[1]})`;
          } else if (geometry.type === 'LineString') {
            const coordsText = geometry.coordinates.map((p: number[]) => `${p[0]} ${p[1]}`).join(', ');
            return `LINESTRING(${coordsText})`;
          }
          // Add other types (MultiPolygon etc.) if needed
          return JSON.stringify(geometry).replace(/,/g, ";"); // Fallback to modified JSON string
        } catch (e) {
            console.error("Error converting geometry to WKT:", e, geometry)
            return "CONVERSION_ERROR";
        }
      }

      // Function to safely escape CSV content
      const escapeCsv = (field: string | null | undefined): string => {
            if (field === null || field === undefined) return '""';
            let str = String(field);
            // If field contains comma, newline, or double quote, enclose in double quotes
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                // Escape existing double quotes by doubling them
                str = str.replace(/"/g, '""');
                // Enclose the entire field in double quotes
                return `"${str}"`;
            }
            return str; // Return as is if no special characters
       };


      for (const ann of annotations) {
        const row = [
          escapeCsv(ann.id),
          escapeCsv(ann.substation_uuid),
          escapeCsv(ann.substation_full_id),
          escapeCsv(ann.label), // Includes "Other"
          escapeCsv(ann.additional_info), // Contains custom details or legacy labels
          escapeCsv(ann.annotation_by),
          escapeCsv(ann.created_at),
          escapeCsv(geojsonToWkt(ann.geometry)), // Convert geometry to WKT
        ];
        csvRows.push(row.join(","));
      }
      downloadFile("completed_annotations.csv", csvRows.join("\n"), "text/csv;charset=utf-8;");
    } catch (e: any) {
      console.error("CSV Download error:", e);
      toast({ variant: "destructive", title: "CSV Download Failed", description: e.message || "An unknown error occurred." });
    } finally {
      setDownloading(false);
    }
  }

  // Option 2: Download JSON (Annotations only, cleaned)
  async function handleDownloadJSON() {
    setDownloading(true);
    try {
      let { annotations } = await fetchCompleteAnnotations();

      if (annotations.length === 0) {
        toast({ variant: "destructive", title: "No Data", description: "No completed annotations found to download." });
        setDownloading(false);
        return;
      }

      // Optionally clean up: Remove deprecated 'confirmed' field if it sneaks through `select` somehow
      // const cleanedAnnotations = annotations.map(({ confirmed, ...rest }) => rest);
      // For now, assuming select works and 'confirmed' isn't fetched.

      const jsonString = JSON.stringify(annotations, null, 2); // Pretty print
      downloadFile("completed_annotations.json", jsonString, "application/json;charset=utf-8;");
    } catch (e: any) {
      console.error("JSON Download error:", e);
      toast({ variant: "destructive", title: "JSON Download Failed", description: e.message || "An unknown error occurred." });
    } finally {
        setDownloading(false);
    }
  }

  // Option 3: Download GeoJSON FeatureCollection
  async function handleDownloadGeoJSON() {
    setDownloading(true);
    try {
        const { annotations } = await fetchCompleteAnnotations();

        if (annotations.length === 0) {
            toast({ variant: "destructive", title: "No Data", description: "No completed annotations found to download." });
            setDownloading(false);
            return;
        }

        // Convert annotations to GeoJSON Features
        const features = annotations.map(ann => {
            // Copy properties, exclude geometry
            const { geometry, ...properties } = ann;
            // Delete deprecated 'confirmed' if present
            // delete properties.confirmed;

            return {
                type: "Feature",
                geometry: ann.geometry, // Use the geometry directly
                properties: properties // All other fields become properties
            };
        });

        // Create a FeatureCollection
        const featureCollection = {
            type: "FeatureCollection",
            // Optionally add CRS (Coordinate Reference System) info if known (usually WGS84 for GeoJSON)
            // crs: {
            //     type: "name",
            //     properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } // Standard WGS84 identifier
            // },
            features: features
        };

        const geoJsonString = JSON.stringify(featureCollection, null, 2); // Pretty print
        downloadFile("completed_annotations.geojson", geoJsonString, "application/geo+json;charset=utf-8;");

    } catch (e: any) {
        console.error("GeoJSON Download error:", e);
        toast({ variant: "destructive", title: "GeoJSON Download Failed", description: e.message || "An unknown error occurred." });
    } finally {
        setDownloading(false);
    }
  }


  // Option 4: Download COCO-format JSON (updated)
  async function handleDownloadCOCO() {
    setDownloading(true);
    try {
      const { completeSubs, annotations } = await fetchCompleteAnnotations();

      if (annotations.length === 0 || completeSubs.length === 0) {
        toast({ variant: "destructive", title: "No Data", description: "No completed annotations or substations found." });
        setDownloading(false);
        return;
      }

      // Build "images" array from complete substations.
      const images = completeSubs.map((sub, idx) => ({
        id: sub.full_id || sub.id, // Use substation's full_id or id as COCO image_id
        file_name: sub.name || `substation_${sub.id}`, // Provide a filename hint
        // width, height would require fetching image dimensions, skip for now
      }));

      // Build categories: get distinct standard labels (including "Other").
      const categoryMap: Record<string, number> = {};
      let nextCatId = 1;
      annotations.forEach((ann) => {
        // Use the main `label` field for categorization
        const categoryLabel = ann.label || "Unlabeled"; // Default to "Unlabeled" if somehow null
        if (!categoryMap[categoryLabel]) {
          categoryMap[categoryLabel] = nextCatId++;
        }
      });
      const categories = Object.entries(categoryMap).map(([name, id]) => ({
        id,
        name,
        supercategory: "substation_component", // Optional supercategory
      }));

      // Build annotations array.
      let annId = 1;
      const cocoAnnotations = annotations.map((ann) => {
        let segmentation: number[][] = [];
        let bbox: number[] = [0, 0, 0, 0]; // x, y, width, height
        let area = 0;

        try {
            if (ann.geometry && ann.geometry.type === "Polygon" && ann.geometry.coordinates?.[0]) {
                const ring = ann.geometry.coordinates[0];
                // COCO segmentation format: [x1, y1, x2, y2, ...]
                segmentation = [ring.flat()];

                // Compute bounding box: [minX, minY, width, height]
                const xs = ring.map((c: number[]) => c[0]);
                const ys = ring.map((c: number[]) => c[1]);
                const minX = Math.min(...xs);
                const minY = Math.min(...ys);
                const maxX = Math.max(...xs);
                const maxY = Math.max(...ys);
                bbox = [minX, minY, maxX - minX, maxY - minY];

                // TODO: Calculate actual polygon area if needed, bbox area is simpler placeholder
                area = (maxX - minX) * (maxY - minY); // Placeholder area
            } else {
                 console.warn(`Skipping COCO conversion for non-polygon geometry or invalid polygon: ${ann.id}, type: ${ann.geometry?.type}`);
            }
        } catch(bboxError){
             console.error(`Error processing geometry for COCO annotation ${ann.id}:`, bboxError, ann.geometry);
        }

        const categoryLabel = ann.label || "Unlabeled";

        return {
          id: annId++, // COCO annotation ID
          image_id: ann.substation_full_id || ann.substation_uuid, // Link to COCO image ID
          category_id: categoryMap[categoryLabel] || 0, // Link to COCO category ID (0 if somehow unlabeled)
          segmentation: segmentation, // [[x1, y1, x2, y2, ...]]
          area: area, // Area of bbox (or polygon if calculated)
          bbox: bbox, // [x, y, width, height]
          iscrowd: 0, // Standard value for single instances
          // Add custom attributes for our extra data
          attributes: { // Group custom attributes
                additional_info: ann.additional_info || null,
                annotation_by: ann.annotation_by || null,
                original_annotation_id: ann.id, // Link back to our DB ID
                created_at: ann.created_at,
          }
        };
      }).filter(a => a.segmentation.length > 0); // Only include annotations with valid segmentation

      const coco = {
        info: {
            description: "Substation Component Annotations",
            // url: "",
            version: "1.0",
            year: new Date().getFullYear(),
            contributor: "Idaho National Laboratory",
            date_installed: new Date().toISOString(),
        },
        licenses: [{ url: "License terms subject to change. URL N/A at this time.", id: 1, name: "This project is subject to export control regulations and may not be redistributed, modified, or used without prior written authorization. Licensing terms are provisional and may change pending export control review." }], // Add license info if applicable
        images,
        annotations: cocoAnnotations,
        categories,
      };

      const cocoString = JSON.stringify(coco, null, 2); // Pretty print
      downloadFile("completed_annotations_coco.json", cocoString, "application/json;charset=utf-8;");
    } catch (e: any) {
      console.error("COCO Download error:", e);
      toast({ variant: "destructive", title: "COCO Download Failed", description: e.message || "An unknown error occurred." });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto"> {/* Added padding and max-width */}
      <h2 className="text-2xl font-semibold mb-3 text-gray-800">Download Data</h2>
      <p className="text-sm text-gray-600 mb-6">
        Download annotations for substations marked as complete in various formats.
        Only annotations created by users (not derived from OSM) are included.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"> {/* Responsive grid */}
        {/* CSV Button */}
        <Button
            onClick={handleDownloadCSV}
            disabled={downloading}
            variant="outline"
            className="w-full justify-center"
            title="Download as Comma Separated Values. Geometry as WKT."
        >
          {downloading ? "Processing..." : "Download CSV"}
        </Button>

        {/* Raw JSON Button */}
        <Button
             onClick={handleDownloadJSON}
             disabled={downloading}
             variant="outline"
             className="w-full justify-center"
             title="Download raw annotation data as JSON objects."
        >
          {downloading ? "Processing..." : "Download JSON"}
        </Button>

        {/* GeoJSON Button */}
        <Button
             onClick={handleDownloadGeoJSON}
             disabled={downloading}
             variant="outline"
             className="w-full justify-center"
             title="Download as GeoJSON FeatureCollection."
        >
          {downloading ? "Processing..." : "Download GeoJSON"}
        </Button>


        {/* COCO Button */}
        <Button
             onClick={handleDownloadCOCO}
             disabled={downloading}
             variant="outline"
             className="w-full justify-center"
             title="Download in COCO format for object detection/segmentation tasks."
        >
          {downloading ? "Processing..." : "Download COCO"}
        </Button>
      </div>
       {downloading && <p className="text-sm text-center text-gray-500 mt-4">Preparing download, please wait...</p>}
    </div>
  );
}