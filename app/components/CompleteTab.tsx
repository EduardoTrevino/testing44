"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { getSupabaseClient } from "@/lib/supabase";
import { useUserStore } from "@/lib/store"; // Import the user store
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"; // Import Input component
import { Textarea } from "@/components/ui/textarea"; // Import Textarea for additional info
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Copy, Expand, Minimize, RefreshCcw } from 'lucide-react'; // Added RefreshCcw for Reopen
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Dynamically import the Leaflet map
const MapLeaflet = dynamic(() => import("@/components/MapLeaflet"), { ssr: false });

// Constants should match AnnotateTab
const SUBSTATION_TYPES = [
  "Transmission", "Distribution", "Industrial owned", "Customer Owned",
  "Sub-transmission station", "Switching station", "Gas Insulated Substation", "Other",
];

const COMPONENT_OPTIONS = [
    "Other", "Battery bank", "Bus bar", "Capacitor bank", "Circuit breaker", "Circuit switch",
    "Closed blade disconnect switch", "Closed tandem disconnect switch", "Control house",
    "Current transformer", "Fuse disconnect switch", /*"Gas Insulated Substation",*/ // Verify if this is a component
    "Glass disc insulator", "High side power area", "Lightning arrester", "Muffle",
    "Open blade disconnect switch", "Open tandem disconnect switch", "Potential transformer",
    "Power Compensator", "Power Generator", "Power Line", "Power Plant", "Power Switch",
    "Power Tower", "Power Transformer", "Recloser", "Spare equipment",
    "Tripolar disconnect switch", "Vehicles",
].sort(); // Use the same sorted list as AnnotateTab

// Interfaces should match AnnotateTab
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
  substation_uuid?: string | null;
  label: string;
  geometry: any;
  created_at: string;
  substation_full_id?: string;
  from_osm: boolean;
  additional_info?: string | null;
  annotation_by?: string | null;
  confirmed?: boolean;
}

export default function CompleteTab() {
  const [substations, setSubstations] = useState<SubstationData[]>([]);
  const [selectedSubstation, setSelectedSubstation] = useState<SubstationData | null>(null);
  const [componentPolygons, setComponentPolygons] = useState<ComponentPolygon[]>([]);
  const [showOsmPolygons, setShowOsmPolygons] = useState(true);

  // State for map display
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Dialog state - Mirrors AnnotateTab
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPolygon, setDialogPolygon] = useState<ComponentPolygon | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<string>(""); // Single selection
  const [dialogAdditionalInfo, setDialogAdditionalInfo] = useState(""); // New state for additional info
  const [dialogSearchTerm, setDialogSearchTerm] = useState(""); // State for search input

  // Hooks
  const { toast } = useToast();
  const { name: annotatorName } = useUserStore(); // Get annotator name for potential edits

  // ─────────────────────────────────────────────────────────────
  // Fetching and Setup Logic
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchCompletedSubstations();
  }, []);

  useEffect(() => {
    if (!selectedSubstation) {
        setComponentPolygons([]); // Clear polygons if no substation selected
        return;
    };
    // No setupSubstationType needed as it's read-only
    fetchComponentPolygons(selectedSubstation.id);
    setIsMapFullscreen(false); // Reset fullscreen on selection change
  }, [selectedSubstation]);

  async function fetchCompletedSubstations() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("substations")
      .select("*")
      .eq("completed", true) // Fetch completed ones
      .order("created_at", { ascending: false }); // Show most recent first
    if (error) {
      console.error("Error fetching completed substations:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load completed substations." });
      return;
    }
    setSubstations(data || []);
    if (data && data.length > 0) {
      setSelectedSubstation(data[0]);
    } else {
      setSelectedSubstation(null);
    }
  }

  async function fetchComponentPolygons(substationId: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("component_polygons")
      .select("*")
      .eq("substation_uuid", substationId); // Fetch by UUID

    if (error) {
        console.error("Error fetching component polygons:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load component polygons." });
        setComponentPolygons([]);
        return;
    }
    setComponentPolygons(data || []);
  }

  // ─────────────────────────────────────────────────────────────
  // Substation Selection
  // ─────────────────────────────────────────────────────────────
  function handleSelectSubstation(sub: SubstationData) {
    if (selectedSubstation?.id === sub.id) return;
    setSelectedSubstation(sub);
    // Polygons fetched via useEffect
  }

  // ─────────────────────────────────────────────────────────────
  // Polygon Drawing and Editing (Mirrors AnnotateTab)
  // ─────────────────────────────────────────────────────────────
  function handlePolygonCreated(geojson: any) {
    if (!selectedSubstation) return;
    // Reset dialog state for new polygon
    setSelectedComponent("");
    setDialogAdditionalInfo("");
    setDialogSearchTerm("");

    const newPoly: ComponentPolygon = {
      id: `temp-${Date.now()}`,
      substation_id: selectedSubstation.id,
      substation_uuid: selectedSubstation.id,
      label: "", // Will be set on save
      geometry: geojson.geometry,
      created_at: new Date().toISOString(),
      substation_full_id: selectedSubstation.full_id || undefined,
      from_osm: false,
    };
    setDialogPolygon(newPoly);
    setDialogOpen(true);
  }

  // Mirrors AnnotateTab's logic for handling legacy labels
  function handlePolygonClicked(poly: ComponentPolygon) {
    if (poly.from_osm) return;

    setDialogSearchTerm("");
    setDialogPolygon(poly);

    const existingLabel = poly.label || "";
    const existingInfo = poly.additional_info || "";

    if (COMPONENT_OPTIONS.includes(existingLabel)) {
        setSelectedComponent(existingLabel);
        setDialogAdditionalInfo(existingInfo);
    } else {
        setSelectedComponent("Other");
        let combinedInfo = existingLabel;
        if (existingInfo) combinedInfo += `\n(Previously: ${existingInfo})`;
        setDialogAdditionalInfo(combinedInfo.trim());
        // Optional: Toast notification about legacy label
        // toast({ title: "Legacy Label", description: `Label "${existingLabel}" moved to Additional Info.`})
    }
    setDialogOpen(true);
  }

  // ─────────────────────────────────────────────────────────────
  // Dialog Logic (Mirrors AnnotateTab)
  // ─────────────────────────────────────────────────────────────

  const filteredComponentOptions = useMemo(() => {
    const lowerSearchTerm = dialogSearchTerm.toLowerCase();
    if (!lowerSearchTerm) return COMPONENT_OPTIONS;
    const matching = COMPONENT_OPTIONS.filter(o => o.toLowerCase().includes(lowerSearchTerm));
    const nonMatching = COMPONENT_OPTIONS.filter(o => !o.toLowerCase().includes(lowerSearchTerm));
    return [...matching, ...nonMatching]; // Show matching first
  }, [dialogSearchTerm]);

  // Save logic identical to AnnotateTab
  async function handleSavePolygon() {
     if (!dialogPolygon || !selectedSubstation) return;
    if (!selectedComponent) {
        toast({ variant: "destructive", title: "Component Required", description: "Please select a component type (e.g., 'Other')." });
        return;
    }
    if (selectedComponent === "Other" && !dialogAdditionalInfo.trim()) {
       toast({ variant: "destructive", title: "Additional Info Required", description: "Please provide details in 'Additional Info' when selecting 'Other'." });
       return;
    }
    if (!annotatorName) {
      toast({ variant: "destructive", title: "User Name Missing", description: "Cannot save annotation without user name. Please log in again." });
      return;
    }

    const isTemp = dialogPolygon.id.startsWith("temp-");
    const geometry = dialogPolygon.geometry;
    if (!geometry) {
        toast({ variant: "destructive", title: "Geometry Missing" });
        return;
    }

    const payload = {
      substation_uuid: selectedSubstation.id,
      substation_full_id: dialogPolygon.substation_full_id ?? selectedSubstation.full_id ?? null,
      label: selectedComponent,
      geometry: geometry,
      from_osm: false,
      additional_info: dialogAdditionalInfo.trim() || null,
      annotation_by: annotatorName, // Log who made the change
    };

    const supabase = getSupabaseClient();
    let savedPolygon: ComponentPolygon | null = null;

    try {
        if (isTemp) {
            const { data, error } = await supabase.from("component_polygons").insert([payload]).select("*").single();
            if (error) throw error;
            savedPolygon = data as ComponentPolygon;
            setComponentPolygons((prev) => [...prev, savedPolygon!]);
            toast({ title: "Annotation Saved", description: `Component "${savedPolygon!.label === 'Other' ? savedPolygon!.additional_info?.substring(0,30)+'...' : savedPolygon!.label}" added.` });
        } else {
            const { data, error } = await supabase.from("component_polygons").update(payload).eq("id", dialogPolygon.id).select("*").single();
             if (error) throw error;
             savedPolygon = data as ComponentPolygon;
             setComponentPolygons((prev) => prev.map((p) => (p.id === dialogPolygon.id ? savedPolygon! : p)));
             toast({ title: "Annotation Updated", description: `Component "${savedPolygon!.label === 'Other' ? savedPolygon!.additional_info?.substring(0,30)+'...' : savedPolygon!.label}" updated.` });
        }
        setDialogOpen(false);
        setDialogPolygon(null);
    } catch (error: any) {
        console.error(`Error ${isTemp ? 'saving' : 'updating'} polygon:`, error);
        toast({ variant: "destructive", title: `${isTemp ? 'Save' : 'Update'} Failed`, description: error?.message });
    }
  }

  // Delete logic identical to AnnotateTab
  async function handleDeletePolygon() {
    if (!dialogPolygon || dialogPolygon.from_osm || dialogPolygon.id.startsWith("temp-")) {
         if(dialogPolygon?.id.startsWith("temp-")) { // Handle deleting unsaved temp polygon
             setDialogOpen(false);
             setDialogPolygon(null);
         }
         return;
    }

    const confirmed = window.confirm(`Are you sure you want to delete the component "${dialogPolygon.label}" from this completed substation? This cannot be undone.`);
    if (!confirmed) return;

    const supabase = getSupabaseClient();
    try {
        const { error } = await supabase.from("component_polygons").delete().eq("id", dialogPolygon.id);
        if (error) throw error;
        setComponentPolygons((prev) => prev.filter((x) => x.id !== dialogPolygon.id));
        toast({ title: "Annotation Deleted", description: `Component "${dialogPolygon.label}" removed.` });
        setDialogOpen(false);
        setDialogPolygon(null);
    } catch(error: any) {
        console.error("Error deleting polygon:", error);
        toast({ variant: "destructive", title: "Delete Failed", description: error?.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Reopen Logic (Specific to CompleteTab)
  // ─────────────────────────────────────────────────────────────
  async function handleReopenSubstation() {
    if (!selectedSubstation) return;

    const confirmed = window.confirm(`Are you sure you want to reopen substation "${selectedSubstation.full_id || selectedSubstation.name || selectedSubstation.id}"? It will move back to the 'Annotate' tab.`);
    if (!confirmed) return;

    const supabase = getSupabaseClient();
    try {
        const { error } = await supabase
            .from("substations")
            .update({ completed: false })
            .eq("id", selectedSubstation.id);
        if (error) throw error;

        toast({ title: "Substation Reopened!", description: `ID: ${selectedSubstation.id} moved to Annotate tab.` });
        // Remove from local list and select next available completed one
        const remainingSubstations = substations.filter((s) => s.id !== selectedSubstation.id);
        setSubstations(remainingSubstations);
        setSelectedSubstation(remainingSubstations[0] || null); // Select the next one or null
        setComponentPolygons([]); // Clear polygons for the newly selected one

    } catch (error: any) {
      console.error("Error reopening substation:", error);
      toast({ variant: "destructive", title: "Reopen Failed", description: error?.message });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Map Polygons and Summary (Mirrors AnnotateTab)
  // ─────────────────────────────────────────────────────────────
  // getMapPolygons logic identical to AnnotateTab
  function getMapPolygons(): ComponentPolygon[] {
    if (!selectedSubstation) return [];
    const boundaryPolygon: ComponentPolygon = {
      id: "substation_boundary_" + selectedSubstation.id,
      substation_id: selectedSubstation.id,
      substation_uuid: selectedSubstation.id,
      label: "power_substation_polygon",
      geometry: selectedSubstation.geometry,
      created_at: selectedSubstation.created_at,
      substation_full_id: selectedSubstation.full_id,
      from_osm: true,
    };
    const activeComponentPolygons = showOsmPolygons
      ? componentPolygons
      : componentPolygons.filter((p) => !p.from_osm);
    return [boundaryPolygon, ...activeComponentPolygons];
  }

  // Summary logic identical to AnnotateTab
  const summaryRows = useMemo(() => {
    const totals: Record<string, { total: number; annotators: Set<string> }> = {};
    componentPolygons
      .filter(cp => !cp.from_osm)
      .forEach((cp) => {
        if (!cp.label) return;
        if (!totals[cp.label]) {
          totals[cp.label] = { total: 0, annotators: new Set() };
        }
        totals[cp.label].total++;
        if (cp.annotation_by) totals[cp.label].annotators.add(cp.annotation_by);
      });
    return Object.entries(totals)
      .sort(([labelA], [labelB]) => labelA.localeCompare(labelB))
      .map(([label, data]) => ({
        label,
        total: data.total,
        annotators: Array.from(data.annotators).join(', ') || 'N/A', // Handle empty annotators
      }));
  }, [componentPolygons]);

  // Coordinate logic identical to AnnotateTab
  const coordinateString = useMemo(() => {
    if (!selectedSubstation?.geometry) return null;
    try {
        const geom = selectedSubstation.geometry;
        if (geom.type === 'Polygon' && geom.coordinates?.[0]?.length > 0) {
            const ring = geom.coordinates[0];
            let sumLat = 0, sumLng = 0;
            const numPoints = ring[0].join(',') === ring[ring.length - 1].join(',') ? ring.length - 1 : ring.length;
            if (numPoints > 0) {
                 for (let i = 0; i < numPoints; i++) { sumLng += ring[i][0]; sumLat += ring[i][1]; }
                 return `${(sumLat / numPoints).toFixed(6)}, ${(sumLng / numPoints).toFixed(6)}`;
            }
        } else if (geom.type === 'Point' && geom.coordinates?.length === 2) {
             return `${geom.coordinates[1].toFixed(6)}, ${geom.coordinates[0].toFixed(6)}`;
        } return "N/A";
    } catch (error) { console.error("Coord calc error:", error); return "Error"; }
  }, [selectedSubstation]);

  const handleCopyCoords = async () => {
    if (!coordinateString || ["N/A", "Error"].includes(coordinateString)) {
        toast({ variant: "destructive", title: "Cannot Copy", description: "Coordinates not available."}); return;
    } try { await navigator.clipboard.writeText(coordinateString); toast({ description: `Coords copied: ${coordinateString}` }); }
    catch (err) { console.error("Copy failed:", err); toast({ variant: "destructive", title: "Copy Failed" }); }
  };

  // ─────────────────────────────────────────────────────────────
  // Keyboard Shortcuts & Fullscreen (Mirrors AnnotateTab)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'o' || e.key === 'O') && !dialogOpen) {
        setShowOsmPolygons((prev) => !prev);
      }
      // Add Esc listener for fullscreen if using CSS method
      if (e.key === 'Escape' && isMapFullscreen) {
          setIsMapFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogOpen, isMapFullscreen]); // Add isMapFullscreen dependency

   const toggleFullscreen = () => setIsMapFullscreen(prev => !prev);

  // ─────────────────────────────────────────────────────────────
  // Render JSX (Structure mirrors AnnotateTab, content adapted)
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-row gap-4 mt-6 h-[calc(100vh-100px)]">

      {/* Sidebar: Completed Substations List */}
      {!isMapFullscreen && (
        <div className="w-64 flex flex-col flex-shrink-0 border-r pr-4">
            <div className="mb-2 font-semibold text-gray-800">
            {substations.length} Completed Substations
            </div>
            <div className="mb-2 text-xs text-gray-500">Select to view or edit annotations.</div>
            <ScrollArea className="flex-1">
            <div className="space-y-1">
                {substations.map((sub) => (
                <div
                    key={sub.id}
                    className={cn("p-2 rounded hover:bg-gray-100 cursor-pointer border border-transparent", selectedSubstation?.id === sub.id ? "bg-blue-50 border-blue-200 font-medium" : "")}
                    onClick={() => handleSelectSubstation(sub)}
                    title={`ID: ${sub.id}\nType: ${sub.substation_type || 'N/A'}`}
                >
                    <div className="text-sm truncate">{sub.full_id || sub.name || "Unnamed Substation"}</div>
                    <div className="text-xs text-gray-500">{new Date(sub.created_at).toLocaleDateString()}</div>
                </div>
                ))}
                {substations.length === 0 && <div className="text-sm text-gray-500 p-4 text-center">No completed substations found.</div>}
            </div>
            </ScrollArea>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative min-w-0">

        {/* Controls Overlay */}
        <div className={cn("absolute top-2 right-2 z-[1000] flex items-center gap-3", isMapFullscreen && "z-[99999]")}>
            <button onClick={toggleFullscreen} className="p-2 bg-white bg-opacity-90 rounded shadow-md hover:bg-gray-100" title={isMapFullscreen ? "Exit Fullscreen (Esc)" : "Enter Fullscreen"}>
                {isMapFullscreen ? <Minimize className="h-5 w-5 text-gray-700" /> : <Expand className="h-5 w-5 text-gray-700" />}
            </button>
            <div className="bg-white bg-opacity-90 p-2 rounded shadow-md flex items-center gap-2">
                <label htmlFor="toggle-osm-comp" className="text-sm font-medium cursor-pointer select-none" title="Toggle OSM polygons (o)">OSM Data</label>
                <Switch id="toggle-osm-comp" checked={showOsmPolygons} onCheckedChange={setShowOsmPolygons}/>
            </div>
        </div>

        {/* Content Display */}
        {selectedSubstation ? (
          <div className={cn("flex-1 flex flex-col", isMapFullscreen ? "h-full" : "")}>
            {/* Top Section: Coords, Type (Read-only, Hidden in Fullscreen) */}
            {!isMapFullscreen && (
              <Card className="p-3 mb-4 bg-white shadow-sm">
                 {coordinateString && (
                    <div className="mb-3 flex items-center justify-center text-xs text-gray-600">
                        <span className="font-medium mr-1">Coords:</span>
                        <span>{coordinateString}</span>
                        <button onClick={handleCopyCoords} className="ml-2 p-0.5 rounded hover:bg-gray-200" title="Copy coordinates">
                            <Copy className="h-3.5 w-3.5 text-gray-500" />
                        </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="font-semibold text-sm shrink-0">Substation Type:</label>
                    {/* Read-only display */}
                    <span className="text-sm px-2 py-1 bg-gray-100 rounded border border-gray-200">
                        {selectedSubstation.substation_type || "(Not Set)"}
                    </span>
                  </div>
              </Card>
            )}

            {/* Map Container */}
            <div ref={mapContainerRef} className={cn("relative border bg-gray-100", isMapFullscreen ? "fixed inset-0 z-[9999] border-none" : "flex-1 min-h-[350px]")}>
                <MapLeaflet
                    key={selectedSubstation.id} // Force re-render on change
                    polygons={getMapPolygons()}
                    onPolygonCreated={handlePolygonCreated} // Allow adding new polygons
                    onPolygonClicked={handlePolygonClicked} // Allow editing existing
                    isMapFullscreen={isMapFullscreen}
                />
            </div>

            {/* Bottom Section: Reopen Button, Summary (Hidden in Fullscreen) */}
             {!isMapFullscreen && (
                <div className="mt-4 flex justify-between items-start gap-4">
                    {/* Component Summary Card */}
                    <Card className="p-3 bg-white shadow-sm flex-1 max-w-md">
                        <h2 className="text-base font-semibold mb-2 border-b pb-1">Component Summary</h2>
                        {summaryRows.length === 0 ? (
                            <div className="text-sm text-gray-500">No user annotations found.</div>
                        ) : (
                            <ScrollArea className="h-[100px]">
                                <table className="text-xs w-full">
                                    <thead>
                                    <tr className="text-left">
                                        <th className="py-1 pr-2 font-medium">Label</th>
                                        <th className="py-1 pr-2 font-medium">Count</th>
                                        <th className="py-1 font-medium">Annotator(s)</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {summaryRows.map(({ label, total, annotators }) => (
                                        <tr key={label} className="border-t">
                                            <td className="py-1 pr-2 truncate" title={label}>{label}</td>
                                            <td className="py-1 pr-2">{total}</td>
                                            <td className="py-1 truncate" title={annotators}>{annotators}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                             </ScrollArea>
                        )}
                    </Card>
                    {/* Reopen Button */}
                    <Button onClick={handleReopenSubstation} className="bg-yellow-500 hover:bg-yellow-600 text-black shrink-0" title="Move this substation back to the 'Annotate' tab.">
                        <RefreshCcw className="mr-2 h-4 w-4" /> Reopen Substation
                    </Button>
                 </div>
            )}
          </div>
        ) : (
          // Placeholder when no substation is selected
          <div className="flex-1 flex items-center justify-center p-8 text-gray-500 bg-gray-50 rounded">
             {substations.length > 0 ? "Select a completed substation from the sidebar." : "No completed substations found."}
          </div>
        )}
      </div> {/* End Main Content Area */}


      {/* Annotation Dialog (Mirrors AnnotateTab) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="z-[10000] max-w-lg w-[90vw]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            {/* Title reflects if it's new or existing */}
            <DialogTitle>{dialogPolygon?.id.startsWith('temp-') ? 'Add New Component' : 'Update Component'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
            {/* Search Input */}
            <div>
              <label htmlFor="component-search-comp" className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <Input id="component-search-comp" placeholder="Filter components..." value={dialogSearchTerm} onChange={(e) => setDialogSearchTerm(e.target.value)}/>
            </div>
            {/* Additional Info Input */}
            <div>
              <label htmlFor="additional-info-comp" className="block text-sm font-medium text-gray-700 mb-1">Additional Info {selectedComponent === 'Other' ? '(Required)' : '(Optional)'}</label>
              <Textarea id="additional-info-comp" placeholder="e.g., Voltage, Model, Notes..." value={dialogAdditionalInfo} onChange={(e) => setDialogAdditionalInfo(e.target.value)} rows={2}/>
               <p className="text-xs text-gray-500 mt-1">{selectedComponent === 'Other' ? 'Describe the component when selecting Other.' : 'Any extra details.'}</p>
            </div>
            {/* Component List */}
             <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Component Type <span className="text-red-500">*</span></label>
                <ScrollArea className="h-48 w-full rounded-md border p-2">
                  <div className="space-y-1">
                    {filteredComponentOptions.map((option) => (
                      <div key={option} className="flex items-center gap-2 p-1 hover:bg-gray-100 rounded -ml-1">
                        <input type="radio" id={`component-${option}-comp`} name="componentSelectionComp" value={option} checked={selectedComponent === option} onChange={() => setSelectedComponent(option)} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"/>
                        <label htmlFor={`component-${option}-comp`} className="text-sm w-full cursor-pointer select-none">{option}</label>
                      </div>
                    ))}
                    {filteredComponentOptions.length === 0 && dialogSearchTerm && <p className="text-sm text-gray-500 p-2">No matching components found.</p>}
                  </div>
                </ScrollArea>
             </div>
          </div>
          <DialogFooter className="mt-4 pt-4 border-t">
            {dialogPolygon && !dialogPolygon.id.startsWith('temp-') && ( <Button variant="destructive" onClick={handleDeletePolygon} className="mr-auto"> Delete </Button> )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePolygon} disabled={!selectedComponent || !annotatorName || (selectedComponent === 'Other' && !dialogAdditionalInfo.trim())}>
              {dialogPolygon?.id.startsWith('temp-') ? 'Save New' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div> // End Outer Flex Container
  );
}