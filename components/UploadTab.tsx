"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import shp from "shpjs";

/**
 * This "UploadTab" allows you to:
 *  1) Upload the substation shapefile zip (e.g. "osm_with_buildings_removed.zip").
 *  2) Upload any number of other component shapefile zips:
 *     ("power_compensator.zip", "power_switch.zip", etc.)
 * The code will parse each shapefile and insert rows into:
 *   - `substations` if the file is recognized as the substation file.
 *   - `component_polygons` otherwise, with substation_id = null.
 */

export default function UploadTab() {
  const { toast } = useToast();

  const [zipFiles, setZipFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  function log(msg: string) {
    setLogs((prev) => [...prev, msg]);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const all = Array.from(e.target.files);
    setZipFiles(all);
    setLogs([]);
  }

  async function handleUpload() {
    if (zipFiles.length === 0) {
      toast({ title: "No .zip shapefiles selected", variant: "destructive" });
      return;
    }

    setUploading(true);
    setLogs([]);

    try {
      for (const file of zipFiles) {
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith(".zip")) {
          log(`Skipping "${file.name}" - not a .zip file`);
          continue;
        }

        // We'll parse the shapefile
        log(`Parsing shapefile: ${file.name}`);
        const arrayBuffer = await file.arrayBuffer();
        const geojsonResult = await shp(arrayBuffer);
        // shpjs can return a single FeatureCollection or an array of FeatureCollections
        const collections = Array.isArray(geojsonResult)
          ? geojsonResult
          : [geojsonResult];

        // Decide if this zip is "the substation file" or a "component" file:
        // For example, if it has "osm_with_buildings_removed" in the name,
        // we treat it as the substation polygons. Otherwise, it's a component set.
        const isSubstationsFile = fileName.includes("osm_with_buildings_removed");

        for (const fc of collections) {
          if (!fc || fc.type !== "FeatureCollection") {
            log(`Skipping - not a valid FeatureCollection in ${file.name}`);
            continue;
          }

          log(
            `Found ${fc.features.length} features in "${file.name}" to insert as ${
              isSubstationsFile ? "substations" : "components"
            }.`
          );

          if (isSubstationsFile) {
            // Insert each substation polygon as a row in `substations`
            for (const feat of fc.features) {
              const props = feat.properties || {};
              // optional: store an OSM "full_id" or "name" if present
              const { error: insertErr } = await supabase
                .from("substations")
                .insert([
                  {
                    full_id: props.full_id ?? null,
                    name: props.name ?? null,
                    geometry: feat.geometry, // the polygon
                  },
                ]);
              if (insertErr) {
                log(`Error inserting substation: ${insertErr.message}`);
              }
            }
          } else {
            // Insert each feature into `component_polygons` with substation_id = null
            const labelName = fileName.replace(".zip", ""); // e.g. "power_switch"
            for (const feat of fc.features) {
              const { error: cErr } = await supabase
                .from("component_polygons")
                .insert([
                  {
                    substation_id: null, // We'll let annotation step assign
                    label: labelName,
                    geometry: feat.geometry,
                    confirmed: false,
                  },
                ]);
              if (cErr) {
                log(`Error inserting component: ${cErr.message}`);
              }
            }
          }
        }
      }

      toast({
        title: "Success",
        description: "All shapefile(s) uploaded and parsed successfully.",
      });
      log("Upload complete!");
    } catch (err: any) {
      console.error(err);
      log(`Error: ${err.message}`);
      toast({
        title: "Upload failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-6">
      <Card className="p-6 bg-white shadow-md">
        <h2 className="text-xl font-semibold mb-4">Upload Shapefile .zip(s)</h2>
        <p className="text-sm text-gray-700">
          Select one or more .zip shapefiles:
          <br />• If filename includes "osm_with_buildings_removed", we treat it as substation polygons.
          <br />• Otherwise, we treat them as substation components.
        </p>
        <input
          type="file"
          multiple
          accept=".zip"
          onChange={handleFileSelect}
          className="mt-4"
        />

        <Button onClick={handleUpload} disabled={uploading} className="mt-4">
          {uploading ? "Uploading..." : "Upload Shapefiles"}
        </Button>

        <div className="mt-4 bg-gray-50 p-3 rounded border text-sm h-32 overflow-auto">
          {logs.map((m, i) => (
            <div key={i}>• {m}</div>
          ))}
        </div>
      </Card>
    </div>
  );
}
