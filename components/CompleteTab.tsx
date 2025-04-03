"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch"; // or your UI kit’s toggle

const MapLeaflet = dynamic(() => import("@/components/MapLeaflet"), { ssr: false });

const SUBSTATION_TYPES = [
  "Transmission",
  "Distribution",
  "Industrial owned",
  "Customer Owned",
  "Sub-transmission station",
  "Switching station",
  "Gas Insulated Substation",
  "Other",
];

const COMPONENT_OPTIONS = [
  "Power Compensator",
  "Power Transformer",
  "Power Generator",
  "Power Line",
  "Power Plant",
  "Power Switch",
  "Power Tower",
  "Circuit switch",
  "Circuit breaker",
  "High side power area",
  "Capacitor bank",
  "Battery bank",
  "Bus bar",
  "Control house",
  "Spare equipment",
  "Vehicles",
  "Tripolar disconnect switch",
  "Recloser",
  "Fuse disconnect switch",
  "Closed blade disconnect switch",
  "Current transformer",
  "Open blade disconnect switch",
  "Closed tandem disconnect switch",
  "Open tandem disconnect switch",
  "Lightning arrester",
  "Glass disc insulator",
  "Potential transformer",
  "Muffle",
];

interface SubstationData {
  id: string;
  full_id?: string;
  name?: string;
  substation_type?: string | null;
  geometry: any;
  created_at: string;
  completed: boolean;
}

interface ComponentPolygon {
  id: string;
  substation_id: string | null;
  substation_full_id?: string;
  label: string;
  confirmed?: boolean;
  geometry: any;
  created_at: string;
  from_osm: boolean;
}

export default function CompleteTab() {
  const [substations, setSubstations] = useState<SubstationData[]>([]);
  const [selectedSubstation, setSelectedSubstation] = useState<SubstationData | null>(null);

  const [componentPolygons, setComponentPolygons] = useState<ComponentPolygon[]>([]);
  const [substationType, setSubstationType] = useState<string>("");
  const [showOsmPolygons, setShowOsmPolygons] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPolygon, setDialogPolygon] = useState<ComponentPolygon | null>(null);
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");

  useEffect(() => {
    fetchCompletedSubstations();
  }, []);

  async function fetchCompletedSubstations() {
    const { data, error } = await supabase
      .from("substations")
      .select("*")
      .eq("completed", true)
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    setSubstations(data || []);
    if (data && data.length > 0) {
      setSelectedSubstation(data[0]);
    }
  }

  useEffect(() => {
    if (!selectedSubstation) return;
    setSubstationType(selectedSubstation.substation_type || "");
    fetchComponentPolygons(selectedSubstation.id);
  }, [selectedSubstation]);

  async function fetchComponentPolygons(substationId: string) {
    // assigned
    const { data: assigned, error: assignedErr } = await supabase
      .from("component_polygons")
      .select("*")
      .eq("substation_uuid", substationId);
    if (assignedErr) console.error(assignedErr);

    // unassigned
    const { data: unassigned, error: unassignedErr } = await supabase
      .from("component_polygons")
      .select("*")
      .is("substation_uuid", null);
    if (unassignedErr) console.error(unassignedErr);

    const combined = [...(assigned || []), ...(unassigned || [])];
    setComponentPolygons(combined);
  }

  function handleSelectSubstation(sub: SubstationData) {
    setSelectedSubstation(sub);
    setComponentPolygons([]);
  }

  function handlePolygonCreated(geojson: any) {
    if (!selectedSubstation) return;
    const newPoly: ComponentPolygon = {
      id: `temp-${Date.now()}`,
      substation_id: selectedSubstation.id,
      label: "",
      confirmed: false, // not used anymore, but remains in DB
      geometry: geojson.geometry,
      created_at: new Date().toISOString(),
      substation_full_id: selectedSubstation.full_id || undefined,
      from_osm: false,
    };
    setDialogPolygon(newPoly);
    setSelectedComponents([]);
    setOtherText("");
    setDialogOpen(true);
  }

  function handlePolygonClicked(poly: ComponentPolygon) {
    // For newly-drawn polygons we can still allow editing:
    if (poly.from_osm) {
      // If from_osm => do nothing now that we don't confirm them
      return;
    }
    // Else open the dialog so user can rename or delete
    setDialogPolygon(poly);
    if (COMPONENT_OPTIONS.includes(poly.label)) {
      setSelectedComponents([poly.label]);
      setOtherText("");
    } else {
      setSelectedComponents([]);
      setOtherText(poly.label || "");
    }
    setDialogOpen(true);
  }

  function toggleComponent(c: string) {
    setSelectedComponents((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  async function handleSavePolygon() {
    if (!dialogPolygon || !selectedSubstation) return;
    const finalLabel =
      selectedComponents.length > 0 ? selectedComponents[0] : otherText.trim() || "";

    const isTemp = dialogPolygon.id.startsWith("temp-");
    const payload = {
      substation_uuid: selectedSubstation.id,
      substation_full_id: dialogPolygon.substation_full_id ?? selectedSubstation.full_id ?? null,
      label: finalLabel,
      geometry: dialogPolygon.geometry,
      confirmed: false, // or true again doesnt matter
      from_osm: false,
    };

    if (isTemp) {
      // insert
      const { data, error } = await supabase
        .from("component_polygons")
        .insert([payload])
        .select("*");
      if (!error && data) {
        setComponentPolygons((prev) => [...prev, ...data]);
      } else {
        console.error(error);
      }
    } else {
      // update
      const { data, error } = await supabase
        .from("component_polygons")
        .update(payload)
        .eq("id", dialogPolygon.id)
        .select("*");
      if (!error && data) {
        setComponentPolygons((prev) =>
          prev.map((p) => (p.id === dialogPolygon.id ? data[0] : p))
        );
      } else {
        console.error(error);
      }
    }
    setDialogOpen(false);
    setDialogPolygon(null);
  }

  async function handleDeletePolygon() {
    if (!dialogPolygon) return;
    if (dialogPolygon.id.startsWith("temp-")) {
      setDialogOpen(false);
      setDialogPolygon(null);
      return;
    }
    const { error } = await supabase
      .from("component_polygons")
      .delete()
      .eq("id", dialogPolygon.id);
    if (error) console.error(error);
    else {
      setComponentPolygons((prev) => prev.filter((x) => x.id !== dialogPolygon.id));
    }
    setDialogOpen(false);
    setDialogPolygon(null);
  }

  // Optional "Reopen" substation => sets completed = false
  async function handleReopenSubstation() {
    if (!selectedSubstation) return;
    const { error } = await supabase
      .from("substations")
      .update({ completed: false })
      .eq("id", selectedSubstation.id);
    if (error) {
      console.error(error);
      alert("Error reopening substation");
      return;
    }
    alert("Substation reopened!");
    // remove from local
    setSubstations((prev) => prev.filter((s) => s.id !== selectedSubstation.id));
    setSelectedSubstation(null);
    setComponentPolygons([]);
  }

  function getMapPolygons() {
    if (!selectedSubstation) return [];
    const boundaryPolygon: ComponentPolygon = {
      id: "substation_" + selectedSubstation.id,
      substation_id: selectedSubstation.id,
      label: "power_substation_polygon",
      confirmed: false,
      geometry: selectedSubstation.geometry,
      created_at: selectedSubstation.created_at,
      substation_full_id: selectedSubstation.full_id,
      from_osm: true,
    };

    const filtered = showOsmPolygons
      ? componentPolygons
      : componentPolygons.filter((p) => p.from_osm === false);

    // Return boundary + filtered polygons
    return [boundaryPolygon, ...filtered];
  }

  // Summaries
  const labelTotals: Record<string, number> = {};
  componentPolygons.forEach((cp) => {
    if (!cp.label) return;
    labelTotals[cp.label] = (labelTotals[cp.label] || 0) + 1;
  });

  const summaryRows = Object.keys(labelTotals)
    .sort()
    .map((lbl) => ({
      lbl,
      total: labelTotals[lbl],
    }));

    useEffect(() => {
      function handleKeyDown(e: KeyboardEvent) {
        // Example: press "o" toggles showOsmPolygons
        if (e.key === "o" || e.key === "O") {
          setShowOsmPolygons((prev) => !prev);
        }
      }
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);
  

  return (
    <div className="flex gap-4 mt-6">
      <div className="w-64 flex flex-col">
        <div className="mb-4 font-semibold text-gray-800">
          {substations.length} completed substations
        </div>
        <ScrollArea className="h-[600px]">
          <div className="flex flex-col space-y-2">
            {substations.map((sub) => (
              <div
                key={sub.id}
                className={`p-2 rounded hover:bg-gray-100 cursor-pointer ${
                  selectedSubstation?.id === sub.id ? "bg-gray-200" : ""
                }`}
                onClick={() => handleSelectSubstation(sub)}
              >
                <div className="text-sm font-medium">
                  {sub.full_id || sub.name || "Unnamed Substation"}
                </div>
                <div className="text-xs text-gray-600">
                  {sub.created_at.slice(0, 10)}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col relative">
        {/* Toggle OSM data positioned absolutely */}
        <div className="absolute top-2 right-2 z-[500] bg-white bg-opacity-90 p-2 rounded shadow-md flex items-center gap-2">
          <label htmlFor="toggle-osm" className="text-sm font-medium">
            Show OSM Polygons (Shortcut "o")
          </label>
          <Switch
            id="toggle-osm"
            checked={showOsmPolygons}
            onCheckedChange={setShowOsmPolygons}
          />
        </div>
        {selectedSubstation ? (
          <>
            <Card className="p-4 bg-white shadow-md flex-1 flex flex-col mb-4">
              <div className="mb-2 flex items-center gap-2">
                <label className="font-bold">Substation Type:</label>
                <span>{selectedSubstation.substation_type || "(none)"} </span>
              </div>

              <div className="flex-1 relative border" style={{ minHeight: 400 }}>
                <MapLeaflet
                  polygons={getMapPolygons()}
                  onPolygonCreated={handlePolygonCreated}
                  onPolygonClicked={handlePolygonClicked}
                />
              </div>

              <Button
                onClick={handleReopenSubstation}
                className="bottom-4 right-4 bg-yellow-300 text-black mt-4"
              >
                Reopen Substation
              </Button>
            </Card>

            <Card className="p-4 bg-white shadow-md mb-4">
              <h2 className="text-lg font-semibold mb-2">Component Summary</h2>
              {summaryRows.length === 0 ? (
                <div className="text-sm text-gray-600">No components found.</div>
              ) : (
                <table className="text-sm w-full border">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-2 py-1 border-b text-left">Label</th>
                      <th className="px-2 py-1 border-b text-left">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map(({ lbl, total }) => (
                      <tr key={lbl}>
                        <td className="px-2 py-1 border-b">{lbl}</td>
                        <td className="px-2 py-1 border-b">{total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        ) : (
          <div className="p-8 text-gray-600">
            Select a substation from the sidebar.
          </div>
        )}
      </div>

      {/* Dialog for polygon labeling */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="z-[9999] max-w-lg"
          style={{ position: "absolute"}}
        >
          <DialogHeader>
            <DialogTitle>Update Component</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 h-64 overflow-auto">
            {COMPONENT_OPTIONS.map((option) => {
              const checked = selectedComponents.includes(option);
              return (
                <div key={option} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleComponent(option)}
                  />
                  <label>{option}</label>
                </div>
              );
            })}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">
                Other Label:
              </label>
              <input
                type="text"
                className="border rounded p-1 w-full"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={handleDeletePolygon}>
              Delete
            </Button>
            <Button onClick={handleSavePolygon}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
