"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
// REMOVED: import { getSupabaseClient } from "@/lib/supabase";
// import {
//   getSubstations,
//   getComponentPolygons,
//   writeSubstations,
//   writeComponentPolygons,
//   generateId,
// } from "@/lib/data"; // IMPORTED
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
import { Copy, Expand, Minimize } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SubstationData, ComponentPolygon } from './../lib/types'; // IMPORT types
import { v4 as uuidv4 } from 'uuid'; // Import uuid

// Dynamically import the Leaflet map
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
  "Other",
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
].sort(); // Keep the master list sorted

// interface SubstationData {
//   id: string;
//   full_id?: string;
//   name?: string;
//   substation_type?: string | null;
//   geometry: any;
//   created_at: string;
//   completed: boolean;
//   tile_url_template?: string | null;
// }

// // Updated interface to include new fields
// interface ComponentPolygon {
//   id: string;
//   substation_id: string | null; // Changed to substation_uuid in DB? Keep consistent
//   substation_uuid?: string | null; // Add if using this field name in DB fetches
//   label: string;
//   geometry: any;
//   created_at: string;
//   substation_full_id?: string;
//   from_osm: boolean;
//   additional_info?: string | null; // New field
//   annotation_by?: string | null;   // New field
//   confirmed?: boolean; // Keep for compatibility if needed, but phasing out
// }


export default function AnnotateTab() {
  const [substations, setSubstations] = useState<SubstationData[]>([]);
  const [selectedSubstation, setSelectedSubstation] = useState<SubstationData | null>(null);
  const [componentPolygons, setComponentPolygons] = useState<ComponentPolygon[]>([]);
  const [showOsmPolygons, setShowOsmPolygons] = useState(true);

  const [substationType, setSubstationType] = useState<string>("");
  const [substationTypeNeedsHighlight, setSubstationTypeNeedsHighlight] = useState<boolean>(false);
  const [substationOtherText, setSubstationOtherText] = useState(""); // State for 'Other' substation type text

  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPolygon, setDialogPolygon] = useState<ComponentPolygon | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<string>(""); // Single selection
  const [dialogAdditionalInfo, setDialogAdditionalInfo] = useState(""); // New state for additional info
  const [dialogSearchTerm, setDialogSearchTerm] = useState(""); // State for search input

  const { toast } = useToast();
  const { name: annotatorName } = useUserStore(); // Get annotator name

  // ─────────────────────────────────────────────────────────────
  // Fetching and Setup Logic
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchSubstations();
  }, []);

  useEffect(() => {
    if (!selectedSubstation) return;
    setupSubstationType(selectedSubstation.substation_type ?? "");
    fetchComponentPolygons(selectedSubstation.id);
    // Reset map fullscreen when substation changes
    setIsMapFullscreen(false);
  }, [selectedSubstation]);

  async function fetchSubstations() {
    try {
      const response = await fetch('/api/substations');
      if (!response.ok) throw new Error('Failed to fetch substations');
      const allSubstations: SubstationData[] = await response.json();
      const incomplete = allSubstations
        .filter(s => !s.completed)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      setSubstations(incomplete);
      if (incomplete.length > 0) {
        setSelectedSubstation(incomplete[0]);
      } else {
        setSelectedSubstation(null);
      }
    } catch (error) {
      console.error("Error fetching substations:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load substations." });
    }
  }

  function setupSubstationType(currentType: string | null | undefined) {
    currentType = currentType ?? "";
    if (!currentType) {
      setSubstationType("");
      setSubstationOtherText("");
      setSubstationTypeNeedsHighlight(true);
    } else if (SUBSTATION_TYPES.includes(currentType)) {
      setSubstationType(currentType);
      setSubstationOtherText("");
      setSubstationTypeNeedsHighlight(false); // Assume existing type is valid unless changed
    } else {
      setSubstationType("Other");
      setSubstationOtherText(currentType);
      setSubstationTypeNeedsHighlight(false); // Assume existing 'Other' type is valid unless changed
    }
  }

  async function fetchComponentPolygons(substationId: string) {
    try {
      const response = await fetch('/api/polygons');
      if (!response.ok) throw new Error('Failed to fetch polygons');
      const allPolygons: ComponentPolygon[] = await response.json();
      const forSubstation = allPolygons.filter(p => p.substation_uuid === substationId);
      setComponentPolygons(forSubstation);
    } catch (error) {
        console.error("Error fetching component polygons:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load component polygons." });
        setComponentPolygons([]);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Substation Handling
  // ─────────────────────────────────────────────────────────────
  function handleSelectSubstation(sub: SubstationData) {
    if (selectedSubstation?.id === sub.id) return; // Avoid re-selecting same one
    setSelectedSubstation(sub);
    setComponentPolygons([]); // Clear previous polygons immediately
  }

  function handleSubstationTypeChange(val: string) {
    setSubstationType(val);
    setSubstationTypeNeedsHighlight(val === "" || (val === "Other" && !substationOtherText.trim()));
    if (val !== "Other") {
        setSubstationOtherText(""); // Clear other text if not 'Other'
        if(val) updateSubstationType(val); // Update DB if a standard type is selected
    }
  }

  function handleSubstationOtherBlur() {
    const trimmedText = substationOtherText.trim();
    if (substationType === "Other" && trimmedText && selectedSubstation) {
      updateSubstationType(trimmedText);
      setSubstationTypeNeedsHighlight(false);
    } else if (substationType === "Other") {
      setSubstationTypeNeedsHighlight(true); // Highlight if 'Other' is selected but text is empty
    }
  }

  async function updateSubstationType(finalVal: string) {
    if (!selectedSubstation) return;
    try {
        const response = await fetch('/api/substations');
        if (!response.ok) throw new Error('Failed to get current substations');
        const allSubstations: SubstationData[] = await response.json();
        const updatedSubstations = allSubstations.map(sub =>
            sub.id === selectedSubstation.id ? { ...sub, substation_type: finalVal } : sub
        );
        const postResponse = await fetch('/api/substations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedSubstations),
        });
        if (!postResponse.ok) throw new Error('Failed to save substations');

        toast({ title: "Substation Type Updated", description: `Set to "${finalVal}"` });
        setSelectedSubstation(prev => prev ? { ...prev, substation_type: finalVal } : null);
    } catch (error) {
        console.error("Error updating substation type:", error);
        toast({ variant: "destructive", title: "Update Failed", description: "Could not save substation type." });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Polygon Drawing and Editing (Dialog Trigger)
  // ─────────────────────────────────────────────────────────────
  function handlePolygonCreated(geojson: any) {
    if (!selectedSubstation) return;
    // Reset dialog state for new polygon
    setSelectedComponent("");
    setDialogAdditionalInfo("");
    setDialogSearchTerm("");

    const newPoly: ComponentPolygon = {
      id: `temp-${Date.now()}`,
      // substation_id: selectedSubstation.id, // Keep original field name for consistency?
      substation_uuid: selectedSubstation.id, // Use UUID field name matching DB schema
      label: "", // Will be set on save
      geometry: geojson.geometry,
      created_at: new Date().toISOString(),
      substation_full_id: selectedSubstation.full_id || undefined,
      from_osm: false,
    };
    setDialogPolygon(newPoly);
    setDialogOpen(true);
  }

  function handlePolygonClicked(poly: ComponentPolygon) {
    if (poly.from_osm) return; // Ignore clicks on OSM polygons

    setDialogSearchTerm(""); // Reset search
    setDialogPolygon(poly); // Set the polygon being edited

    const existingLabel = poly.label || "";
    const existingInfo = poly.additional_info || "";

    // Check if the existing label is a standard component type (now includes "Other")
    if (COMPONENT_OPTIONS.includes(existingLabel)) {
        // It's a standard type (or the explicit "Other")
        setSelectedComponent(existingLabel);
        setDialogAdditionalInfo(existingInfo);
    } else {
        // It's a legacy label not in our standard list
        setSelectedComponent("Other"); // Default to "Other"
        // Combine the legacy label and any existing additional info into the new additional info field
        let combinedInfo = existingLabel; // Start with the legacy label
        if (existingInfo) {
            combinedInfo += `\n(Previously: ${existingInfo})`; // Append old info clearly separated
        }
        setDialogAdditionalInfo(combinedInfo.trim());
        toast({
            title: "Legacy Label Detected",
            description: `Label "${existingLabel}" moved to Additional Info.`,
            duration: 5000, // Show longer
        })
    }

    setDialogOpen(true);
  }

  // ─────────────────────────────────────────────────────────────
  // Dialog Logic (Annotation)
  // ─────────────────────────────────────────────────────────────

  // Memoized filtering and sorting for component options
  const filteredComponentOptions = useMemo(() => {
    const lowerSearchTerm = dialogSearchTerm.toLowerCase();
    if (!lowerSearchTerm) {
      return COMPONENT_OPTIONS; // Use the pre-sorted master list
    }

    const matching: string[] = [];
    const nonMatching: string[] = [];

    COMPONENT_OPTIONS.forEach(option => {
      if (option.toLowerCase().includes(lowerSearchTerm)) {
        matching.push(option);
      } else {
        nonMatching.push(option);
      }
    });

    // Return matching first (already sorted alphabetically), then non-matching (already sorted)
    return [...matching, ...nonMatching];
  }, [dialogSearchTerm]);

  async function handleSavePolygon() {
    if (!dialogPolygon || !selectedSubstation) return;
    if (!selectedComponent) { // This check might be redundant if "Other" is always an option, but good safety.
      toast({ variant: "destructive", title: "Component Required", description: "Please select a component type (e.g., 'Other')." });
      return;
    }
    // --- New Check ---
    if (selectedComponent === "Other" && !dialogAdditionalInfo.trim()) {
       toast({
            variant: "destructive",
            title: "Additional Info Required",
            description: "Please provide details in 'Additional Info' when selecting 'Other'.",
       });
       return; // Prevent saving "Other" without details
    }
    // --- End New Check ---

    if (!annotatorName) {
      toast({ variant: "destructive", title: "User Name Missing", description: "Cannot save annotation without user name. Please refresh or log in again." });
      return;
    }
    const isTemp = dialogPolygon.id.startsWith("temp-");
    const geometry = dialogPolygon.geometry;

    if (!geometry) {
        toast({ variant: "destructive", title: "Geometry Missing", description: "Cannot save annotation without geometry data." });
        return;
    }

    try {
      const allPolygons = await (await fetch('/api/polygons')).json() as ComponentPolygon[];
        let savedPolygon: ComponentPolygon;
        let newPolygonList: ComponentPolygon[];

        if (isTemp) {
            // INSERT (Your original logic for this is perfect and remains unchanged)
            savedPolygon = {
                id: uuidv4(),
                substation_uuid: selectedSubstation.id,
                label: selectedComponent,
                geometry: geometry,
                created_at: new Date().toISOString(),
                substation_full_id: selectedSubstation.full_id || null,
                from_osm: false,
                additional_info: dialogAdditionalInfo.trim() || null,
                annotation_by: annotatorName,
            };
            newPolygonList = [...allPolygons, savedPolygon];
            toast({ title: "Annotation Saved", description: `Component "${savedPolygon.label === 'Other' ? savedPolygon.additional_info?.substring(0,30)+'...' : savedPolygon.label}" added.` });
        } else {
            // UPDATE (This is the minimally changed block)
            const polygonIndex = allPolygons.findIndex(p => p.id === dialogPolygon.id);

            if (polygonIndex === -1) {
                throw new Error("Polygon to update not found in file.");
            }

            // Create the updated polygon object.
            savedPolygon = {
                ...allPolygons[polygonIndex], // Start with the existing polygon data
                label: selectedComponent,
                additional_info: dialogAdditionalInfo.trim() || null,
                annotation_by: annotatorName,
            };

            // Create the new list by replacing the item at the found index.
            newPolygonList = [...allPolygons];
            newPolygonList[polygonIndex] = savedPolygon;

            // This toast message will now work without errors.
            toast({ title: "Annotation Updated", description: `Component "${savedPolygon.label === 'Other' ? savedPolygon.additional_info?.substring(0,30)+'...' : savedPolygon.label}" updated.` });
        }

        // The type error on the next line is also solved because all components
        // now share the same ComponentPolygon type from app/lib/types.ts
        const postResponse = await fetch('/api/polygons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newPolygonList),
        });
        if (!postResponse.ok) throw new Error('Failed to save polygons');
        
        // Refresh local state
        setComponentPolygons(newPolygonList.filter(p => p.substation_uuid === selectedSubstation.id));
        setDialogOpen(false);
        setDialogPolygon(null);

    } catch (error: any) {
        console.error(`Error ${isTemp ? 'inserting' : 'updating'} polygon:`, error);
        toast({ variant: "destructive", title: `${isTemp ? 'Save' : 'Update'} Failed`, description: error?.message || "Could not save annotation." });
    }
  }

  async function handleDeletePolygon() {
    if (!dialogPolygon || dialogPolygon.from_osm || dialogPolygon.id.startsWith("temp-")) {
         if(dialogPolygon?.id.startsWith("temp-")) { // Handle deleting unsaved temp polygon
             setDialogOpen(false);
             setDialogPolygon(null);
         }
         return;
    }

    const confirmed = window.confirm(`Are you sure you want to delete the component "${dialogPolygon.label}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
        const response = await fetch('/api/polygons');
        if (!response.ok) throw new Error('Failed to fetch current polygons');
        const allPolygons: ComponentPolygon[] = await response.json();
        const newPolygonList = allPolygons.filter((p) => p.id !== dialogPolygon.id);
        
        if (newPolygonList.length === allPolygons.length) {
            throw new Error("Polygon to delete not found in file.");
        }

        const postResponse = await fetch('/api/polygons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newPolygonList),
      });

        if (!postResponse.ok) throw new Error('Failed to save updated polygon list');
        
        setComponentPolygons(prev => prev.filter((p) => p.id !== dialogPolygon.id));
        toast({ title: "Annotation Deleted", description: `Component "${dialogPolygon.label}" removed.` });
        setDialogOpen(false);
        setDialogPolygon(null);
    } catch(error: any) {
        console.error("Error deleting polygon:", error);
        toast({ variant: "destructive", title: "Delete Failed", description: error?.message || "Could not delete annotation." });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Completion and Map Data
  // ─────────────────────────────────────────────────────────────
    async function handleCompleteSubstation() {
    if (!selectedSubstation) return;
    if (substationType === "" || (substationType === "Other" && !substationOtherText.trim())) {
        toast({ variant: "destructive", title: "Type Required", description: "Please select or define a substation type before completing." });
        setSubstationTypeNeedsHighlight(true);
        return;
    }

    const finalSubstationType = substationType === 'Other' ? substationOtherText.trim() : substationType;

     const confirmed = window.confirm(`Mark substation "${selectedSubstation.full_id || selectedSubstation.name || selectedSubstation.id}" (Type: ${finalSubstationType}) as complete?`);
     if (!confirmed) return;

    try {
        const response = await fetch('/api/substations');
        if (!response.ok) throw new Error('Failed to fetch current substations');
        let allSubstations: SubstationData[] = await response.json();

        // Use a flag to ensure we found the substation
        let wasUpdated = false;
        const updatedSubstations = allSubstations.map(sub => {
            if (sub.id === selectedSubstation.id) {
                wasUpdated = true;
                return { ...sub, completed: true, substation_type: finalSubstationType };
            }
            return sub;
        });

        if (!wasUpdated) {
            throw new Error("Substation to complete not found in file.");
        }

        // 3. Post the new, complete list back to the API
        const postResponse = await fetch('/api/substations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedSubstations),
      });

        if (!postResponse.ok) throw new Error('Failed to save updated substations list');
        
        toast({ title: "Substation Completed!", description: `ID: ${selectedSubstation.id}` });
        
        // Remove from local list and select next one
        fetchSubstations(); // Easiest way to refresh the list correctly

    } catch (error: any) {
         console.error("Error completing substation:", error);
         toast({ variant: "destructive", title: "Completion Failed", description: error?.message || "Could not mark substation as complete." });
    }
  }

  function getMapPolygons(): ComponentPolygon[] {
    if (!selectedSubstation) return [];
    // Create the boundary polygon object on the fly
    const boundaryPolygon: ComponentPolygon = {
      id: "substation_boundary_" + selectedSubstation.id,
      // substation_id: selectedSubstation.id,
      substation_uuid: selectedSubstation.id,
      label: "power_substation_polygon", // Special label for identification
      geometry: selectedSubstation.geometry,
      created_at: selectedSubstation.created_at,
      substation_full_id: selectedSubstation.full_id,
      from_osm: true, // Treat boundary like an OSM feature for styling/interaction
      // No additional_info or annotation_by for boundary
    };

    const activeComponentPolygons = showOsmPolygons
      ? componentPolygons // Include all fetched polygons (which should be only for this substation)
      : componentPolygons.filter((p) => !p.from_osm); // Filter out OSM ones if toggled off

    // Return boundary + active component polygons
    return [boundaryPolygon, ...activeComponentPolygons];
  }


  // ─────────────────────────────────────────────────────────────
  // Summaries and Coordinate Display
  // ─────────────────────────────────────────────────────────────
  const summaryRows = useMemo(() => {
    const totals: Record<string, { total: number; annotators: Set<string> }> = {};
    componentPolygons
      .filter(cp => !cp.from_osm) // Only count user annotations in summary
      .forEach((cp) => {
        if (!cp.label) return;
        if (!totals[cp.label]) {
          totals[cp.label] = { total: 0, annotators: new Set() };
        }
        totals[cp.label].total++;
        if (cp.annotation_by) {
          totals[cp.label].annotators.add(cp.annotation_by);
        }
      });

    return Object.entries(totals)
      .sort(([labelA], [labelB]) => labelA.localeCompare(labelB)) // Sort by label
      .map(([label, data]) => ({
        label,
        total: data.total,
        annotators: Array.from(data.annotators).join(', '), // Comma-separated list
      }));
  }, [componentPolygons]);

  const coordinateString = useMemo(() => {
    if (!selectedSubstation?.geometry) return null;
    // Basic centroid calculation (average of polygon vertices) - refine if needed
    try {
        const geom = selectedSubstation.geometry;
        if (geom.type === 'Polygon' && geom.coordinates && geom.coordinates[0] && geom.coordinates[0].length > 0) {
            const ring = geom.coordinates[0];
            let sumLat = 0;
            let sumLng = 0;
            const numPoints = ring[0].join(',') === ring[ring.length - 1].join(',') ? ring.length - 1 : ring.length;

            if (numPoints > 0) {
                 for (let i = 0; i < numPoints; i++) {
                    sumLng += ring[i][0];
                    sumLat += ring[i][1];
                 }
                 const lat = sumLat / numPoints;
                 const lng = sumLng / numPoints;
                 return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            }
        } else if (geom.type === 'Point' && geom.coordinates && geom.coordinates.length === 2) {
             return `${geom.coordinates[1].toFixed(6)}, ${geom.coordinates[0].toFixed(6)}`;
        }
        return "N/A"; // Handle other types or invalid geometry
    } catch (error) {
        console.error("Error calculating coordinates:", error);
        return "Error";
    }
  }, [selectedSubstation]);

  const handleCopyCoords = async () => {
    if (!coordinateString || ["N/A", "Error"].includes(coordinateString)) {
        toast({ variant: "destructive", title: "Cannot Copy", description: "Coordinates not available."});
        return;
    }
    try {
      await navigator.clipboard.writeText(coordinateString);
      toast({ description: `Coordinates copied: ${coordinateString}` });
    } catch (err) {
      console.error("Failed to copy coords:", err);
      toast({ variant: "destructive", title: "Copy Failed" });
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Keyboard Shortcuts & Fullscreen
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'o' || e.key === 'O') {
        // Allow toggling OSM only if dialog is not open
        if (!dialogOpen) {
             setShowOsmPolygons((prev) => !prev);
        }
      }
      // Add other shortcuts if needed (e.g., 'f' for fullscreen?)
      // Consider focus: don't trigger shortcuts if user is typing in an input
      // if (e.key === 'f' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
      //    toggleFullscreen();
      // }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogOpen]); // Re-add listener if dialog state changes

   const toggleFullscreen = () => {
        // Uses CSS classes, not native browser fullscreen API
        setIsMapFullscreen(prev => !prev);
   };

  // ─────────────────────────────────────────────────────────────
  // Styling Logic
  // ─────────────────────────────────────────────────────────────
  const substationTypeStyle: React.CSSProperties = {};
  if (substationTypeNeedsHighlight) {
      substationTypeStyle.backgroundColor = "rgba(255, 224, 224, 0.8)"; // Light red/pink
      substationTypeStyle.borderColor = "red";
  }
  const substationOtherStyle: React.CSSProperties = { ...substationTypeStyle }; // Inherit highlight if 'Other' is selected and empty

  // ─────────────────────────────────────────────────────────────
  // Render JSX
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-row gap-4 mt-6 h-[calc(100vh-100px)]"> {/* Adjust height as needed */}

      {/* Sidebar: Substations List */}
      {!isMapFullscreen && ( // Hide sidebar in fullscreen
        <div className="w-64 flex flex-col flex-shrink-0 border-r pr-4">
            <div className="mb-2 font-semibold text-gray-800">
            {substations.length} Substations Remaining
            </div>
            <div className="mb-2 text-xs text-gray-500">Select a substation to annotate.</div>
            <ScrollArea className="flex-1"> {/* Takes remaining height */}
            <div className="space-y-1">
                {substations.map((sub) => (
                <div
                    key={sub.id}
                    className={cn(
                        "p-2 rounded hover:bg-gray-100 cursor-pointer border border-transparent",
                        selectedSubstation?.id === sub.id ? "bg-blue-50 border-blue-200 font-medium" : ""
                    )}
                    onClick={() => handleSelectSubstation(sub)}
                    title={`ID: ${sub.id}\nType: ${sub.substation_type || 'N/A'}`}
                >
                    <div className="text-sm truncate">
                    {sub.full_id || sub.name || "Unnamed Substation"}
                    </div>
                    <div className="text-xs text-gray-500">
                    {new Date(sub.created_at).toLocaleDateString()}
                    </div>
                </div>
                ))}
                {substations.length === 0 && (
                    <div className="text-sm text-gray-500 p-4 text-center">No substations loaded or all are completed.</div>
                )}
            </div>
            </ScrollArea>
        </div>
      )}

      {/* Main Content Area: Map + Details or Fullscreen Map */}
      <div className="flex-1 flex flex-col relative min-w-0"> {/* Allow shrinking */}

        {/* Controls Overlay (OSM Toggle, Fullscreen) */}
        <div className={cn(
             "absolute top-2 right-2 z-[1000] flex items-center gap-3", // z-index higher than map but lower than dialog
             isMapFullscreen && "z-[99999]" // Ensure controls are above fullscreen map
            )}>
            {/* Fullscreen Button */}
            <button
                onClick={toggleFullscreen}
                className="p-2 bg-white bg-opacity-90 rounded shadow-md hover:bg-gray-100 transition-colors"
                title={isMapFullscreen ? "Exit Fullscreen (Esc)" : "Enter Fullscreen"}
                aria-label={isMapFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
                {isMapFullscreen ? (
                    <Minimize className="h-5 w-5 text-gray-700" />
                ) : (
                    <Expand className="h-5 w-5 text-gray-700" />
                )}
            </button>
            {/* OSM Toggle */}
            <div className="bg-white bg-opacity-90 p-2 rounded shadow-md flex items-center gap-2">
                <label htmlFor="toggle-osm" className="text-sm font-medium cursor-pointer select-none" title="Toggle OpenStreetMap derived polygons (Shortcut: o)">
                    OSM Data
                </label>
                <Switch
                    id="toggle-osm"
                    checked={showOsmPolygons}
                    onCheckedChange={setShowOsmPolygons}
                    aria-label="Toggle OSM Polygons"
                />
            </div>
        </div>

        {/* Content Display */}
        {selectedSubstation ? (
          <div className={cn("flex-1 flex flex-col", isMapFullscreen ? "h-full" : "")}>
            {/* Top Section: Coords, Type (Hidden in Fullscreen) */}
            {!isMapFullscreen && (
              <Card className="p-3 mb-4 bg-white shadow-sm">
                 {coordinateString && (
                    <div className="mb-3 flex items-center justify-center text-xs text-gray-600">
                        <span className="font-medium mr-1">Coords:</span>
                        <span>{coordinateString}</span>
                        <button
                            onClick={handleCopyCoords}
                            className="ml-2 p-0.5 rounded hover:bg-gray-200"
                            aria-label="Copy coordinates"
                            title="Copy coordinates"
                        >
                            <Copy className="h-3.5 w-3.5 text-gray-500" />
                        </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap"> {/* Allow wrapping */}
                    <label className="font-semibold text-sm shrink-0">Substation Type:</label>
                    <select
                      className="border px-2 py-1 rounded text-sm"
                      style={substationTypeStyle}
                      value={substationType}
                      onChange={(e) => handleSubstationTypeChange(e.target.value)}
                      title="Select the primary type of this substation."
                    >
                      <option value="">(Select type)</option>
                      {SUBSTATION_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    {substationType === "Other" && (
                      <input
                        type="text"
                        placeholder="Enter custom type"
                        className="border rounded px-2 py-1 text-sm flex-grow min-w-[150px]" // Allow growing
                        style={substationOtherStyle}
                        value={substationOtherText}
                        onChange={(e) => {
                            setSubstationOtherText(e.target.value);
                            setSubstationTypeNeedsHighlight(!e.target.value.trim()); // Highlight if empty
                        }}
                        onBlur={handleSubstationOtherBlur}
                        title="Define the custom substation type."
                      />
                    )}
                  </div>
              </Card>
            )}

            {/* Map Container (Takes flex space or goes fullscreen) */}
            <div
                ref={mapContainerRef}
                className={cn(
                    "relative border bg-gray-100", // Base styles
                    isMapFullscreen
                     ? "fixed inset-0 z-[9999] border-none" // Fullscreen styles
                     : "flex-1 min-h-[350px]" // Normal state: takes remaining space, min height
                 )}
            >
                <MapLeaflet
                    // Key forces re-mount on substation change, ensuring map state resets properly
                    key={selectedSubstation.id}
                    polygons={getMapPolygons()}
                    onPolygonCreated={handlePolygonCreated}
                    onPolygonClicked={handlePolygonClicked}
                    isMapFullscreen={isMapFullscreen}
                />
            </div>

            {/* Bottom Section: Complete Button, Summary (Hidden in Fullscreen) */}
             {!isMapFullscreen && (
                <div className="mt-4 flex justify-between items-start gap-4">
                    {/* Component Summary Card */}
                    <Card className="p-3 bg-white shadow-sm flex-1 max-w-md"> {/* Max width */}
                        <h2 className="text-base font-semibold mb-2 border-b pb-1">Component Summary</h2>
                        {summaryRows.length === 0 ? (
                            <div className="text-sm text-gray-500">Draw or click components to see summary.</div>
                        ) : (
                            <ScrollArea className="h-[100px]"> {/* Fixed height scroll area */}
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
                                            <td className="py-1 truncate" title={annotators}>{annotators || 'N/A'}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                             </ScrollArea>
                        )}
                    </Card>
                    {/* Complete Button */}
                    <Button
                        onClick={handleCompleteSubstation}
                        className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                        title="Mark this substation as fully annotated and move to the next."
                        disabled={substationTypeNeedsHighlight} // Disable if type is not set
                    >
                        Complete Substation
                    </Button>
                 </div>
            )}
          </div>
        ) : (
          // Placeholder when no substation is selected
          <div className="flex-1 flex items-center justify-center p-8 text-gray-500 bg-gray-50 rounded">
             {substations.length > 0 ? "Select a substation from the sidebar." : "No remaining substations to annotate."}
          </div>
        )}
      </div> {/* End Main Content Area */}


      {/* Annotation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="z-[10000] max-w-lg w-[90vw]" onOpenAutoFocus={(e) => e.preventDefault()}> {/* Prevent auto-focus on first field */}
          <DialogHeader>
            <DialogTitle>Annotate Component</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2"> {/* Scrollable content */}
            {/* Search Input */}
            <div>
              <label htmlFor="component-search" className="block text-sm font-medium text-gray-700 mb-1">
                Search Component Types
              </label>
              <Input
                id="component-search"
                placeholder="Filter components..."
                value={dialogSearchTerm}
                onChange={(e) => setDialogSearchTerm(e.target.value)}
              />
            </div>

            {/* Additional Info Input */}
            <div>
              <label htmlFor="additional-info" className="block text-sm font-medium text-gray-700 mb-1">
                Additional Info (Optional)
              </label>
              <Textarea
                id="additional-info"
                placeholder="e.g., Voltage, Model, Notes..."
                value={dialogAdditionalInfo}
                onChange={(e) => setDialogAdditionalInfo(e.target.value)}
                rows={2}
              />
               <p className="text-xs text-gray-500 mt-1">Any extra details about this specific component.</p>
            </div>

            {/* Component List */}
             <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Component Type <span className="text-red-500">*</span> {/* Required */}
                </label>
                <ScrollArea className="h-48 w-full rounded-md border p-2">
                  <div className="space-y-1">
                    {filteredComponentOptions.map((option) => (
                      <div key={option} className="flex items-center gap-2 p-1 hover:bg-gray-100 rounded -ml-1"> {/* Negative margin to align radio */}
                        <input
                          type="radio"
                          id={`component-${option}`}
                          name="componentSelection"
                          value={option}
                          checked={selectedComponent === option}
                          onChange={() => setSelectedComponent(option)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                        />
                        <label htmlFor={`component-${option}`} className="text-sm w-full cursor-pointer select-none">
                          {option}
                        </label>
                      </div>
                    ))}
                     {filteredComponentOptions.length === 0 && dialogSearchTerm && (
                         <p className="text-sm text-gray-500 p-2">No matching components found for {dialogSearchTerm}.</p>
                     )}
                  </div>
                </ScrollArea>
             </div>
          </div>

          <DialogFooter className="mt-4 pt-4 border-t">
             {/* Show Delete only if it's an existing polygon */}
            {dialogPolygon && !dialogPolygon.id.startsWith('temp-') && (
                <Button variant="destructive" onClick={handleDeletePolygon} className="mr-auto"> {/* Push delete to left */}
                    Delete
                </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePolygon} disabled={!selectedComponent || !annotatorName}>
              {dialogPolygon?.id.startsWith('temp-') ? 'Save New' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div> // End Outer Flex Container
  );
}