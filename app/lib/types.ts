export interface SubstationData {
    id: string;
    full_id?: string | null;
    name?: string | null;
    substation_type?: string | null;
    geometry: any;
    created_at: string;
    completed: boolean;
    tile_url_template?: string | null;
  }
  
  export interface ComponentPolygon {
    id: string;
    substation_uuid: string | null;
    label: string;
    geometry: any;
    created_at: string;
    substation_full_id?: string | null;
    from_osm: boolean;
    additional_info?: string | null;
    annotation_by?: string | null;
    // The 'substation_id' and 'confirmed' fields are not in your JSON data,
    // so they should not be in the primary interface.
  }