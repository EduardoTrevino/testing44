import os
import pathlib
import json
import datetime
import math
import sys
import logging
from typing import List, Dict, Any, Optional, Tuple, TypeAlias
import numpy as np
import pyproj
import rasterio
from rasterio import features
from rasterio.enums import Resampling
from rasterio.errors import RasterioIOError, WindowError
from shapely.geometry import shape, Point
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform as shapely_transform
from pystac_client import Client
from PIL import Image
from pystac import Asset as StacAsset # Explicit type for STAC asset which here I decided to just use this webcomputer because that's what is used say in the GeoAI github


# --- Type Aliases for Enhanced Readability ---
# Define custom types for common data structures used throughout the script.
GeoJSONGeometry: TypeAlias = Dict[str, Any]
SubstationRecord: TypeAlias = Dict[str, Any]
ImageArray: TypeAlias = np.ndarray # Representing H, W, C image data i think this is the common format? not sure we can change if needed :)

# --- Configuration Block ---
# Centralized configuration management using a dictionary.
# This approach allows for easier modification and potentially loading from external files.
CONFIG = {
    "INPUT_DATA": {
        "SOURCE_TYPE": "json", # Could be changed Ashley if we want to move this to a CSV/coco/etc. file instead
        "JSON_FILE_PATH": pathlib.Path("./substation_data.json"),
    },
    "GEOSPATIAL": {
        "BUFFER_METERS": 100.0,
        "TARGET_GEOGRAPHIC_CRS": "EPSG:4326", # WGS84 what we are using for our webapplication
        "DEFAULT_RESAMPLING": Resampling.bilinear, # Default resampling for raster reads  but there is also the nearest nei resampling if we want to try that though in my exp it looks blocky
        "BOUNDLESS_READ": True, # Allow reading slightly outside raster bounds if needed, initally I had this causing issues so set to false if you do
    },
    "STAC": {
        "CATALOG_URL": "https://planetarycomputer.microsoft.com/api/stac/v1", # this is what everyone uses from what i read
        "COLLECTION": "naip",
        "ASSET_KEY": "image", # Key for the desired image asset within a STAC item
        "SEARCH_LIMIT": 20, # Limit for STAC search results per feature
    },
    "OUTPUT": {
        "IMAGE_FOLDER": pathlib.Path("./public/naip_images"),
        "IMAGE_FORMAT": "PNG",
        "OPTIMIZE_PNG": True,
    },
    "LOGGING": {
        "LEVEL": logging.INFO,
        "FORMAT": '%(asctime)s - %(levelname)s - %(name)s - %(message)s',
    }
}

# --- Logging Setup ---
# Configure structured logging for better monitoring and debugging.
logging.basicConfig(level=CONFIG["LOGGING"]["LEVEL"], format=CONFIG["LOGGING"]["FORMAT"])
logger = logging.getLogger(__name__) # Get logger for this module

# --- Geospatial Utility Function ---
def calculate_utm_crs(latitude: float, longitude: float) -> pyproj.CRS:
    """
    Determines the appropriate UTM Coordinate Reference System for a given latitude and longitude.

    Args:
        latitude: Latitude of the point.
        longitude: Longitude of the point.

    Returns:
        A pyproj.CRS object representing the calculated UTM zone.

    Raises:
        ValueError: If latitude or longitude are out of valid bounds.
    """
    if not -180 <= longitude <= 180:
        raise ValueError(f"Invalid longitude: {longitude}. Must be between -180 and 180.")
    if not -90 <= latitude <= 90:
        raise ValueError(f"Invalid latitude: {latitude}. Must be between -90 and 90.")

    # Calculate UTM zone number (1-60)
    zone_number = math.floor((longitude + 180) / 6) + 1

    # Determine hemisphere and corresponding EPSG base code
    # Northern Hemisphere EPSG codes start with 326xx, Southern with 327xx accc to google lol if i messed up lmk and we can update
    epsg_base = 32600 if latitude >= 0 else 32700
    epsg_code = epsg_base + zone_number

    logger.debug(f"Calculated UTM zone {zone_number} {'N' if latitude >= 0 else 'S'} (EPSG:{epsg_code}) for ({latitude}, {longitude})")
    return pyproj.CRS(f"EPSG:{epsg_code}")


# --- Data Loading Module ---
class SubstationDataLoader:
    """Handles loading of substation feature data from specified sources."""

    @staticmethod
    def load_from_json(file_path: pathlib.Path) -> List[SubstationRecord]:
        """
        Loads substation records from a JSON file.

        Args:
            file_path: The path to the input JSON file.

        Returns:
            A list of substation records (dictionaries).

        Raises:
            FileNotFoundError: If the JSON file does not exist.
            json.JSONDecodeError: If the file content is not valid JSON.
            TypeError: If the loaded JSON is not a list.
            Exception: For other potential file reading errors.
        """
        logger.info(f"Attempting to load substation data from JSON: {file_path}")
        if not file_path.is_file():
            logger.error(f"Input data file not found: {file_path}")
            raise FileNotFoundError(f"Required input file missing: {file_path}")

        try:
            with file_path.open('r', encoding='utf-8') as f:
                data = json.load(f)

            if not isinstance(data, list):
                logger.error(f"Invalid data format in {file_path}. Expected a JSON list, got {type(data)}.")
                raise TypeError("Loaded JSON data is not a list.")

            logger.info(f"Successfully loaded {len(data)} records from {file_path}")
            return data
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode JSON from {file_path}: {e}")
            raise # Re-raise the specific error
        except IOError as e:
            logger.error(f"An I/O error occurred while reading {file_path}: {e}")
            raise # Re-raise the error
        except Exception as e:
            logger.error(f"An unexpected error occurred during JSON loading: {e}")
            raise # Re-raise any other unexpected error

# --- Core Processing Class ---
class SubstationImageProcessor:
    """
    Encapsulates the logic for processing a single substation record:
    finding corresponding NAIP imagery, cropping it, and saving the output.
    """

    def __init__(self, record_index: int, substation_data: SubstationRecord, config: Dict[str, Any]):
        """
        Initializes the processor for a single substation.

        Args:
            record_index: The 0-based index of the record being processed (for logging).
            substation_data: The dictionary containing data for one substation.
            config: The global configuration dictionary.
        """
        self.record_index: int = record_index
        self.data: SubstationRecord = substation_data
        self.config: Dict[str, Any] = config
        self.logger = logging.getLogger(f"{__name__}.SubstationProcessor") # Specific logger instance

        # Initialize state variables that will be populated during processing
        self.feature_id: str = self._generate_feature_id()
        self.initial_geometry_ll: Optional[BaseGeometry] = None # Geometry in Lat/Lon (WGS84)
        self.buffered_geometry_ll: Optional[BaseGeometry] = None # Buffered geometry in Lat/Lon
        self.target_utm_crs: Optional[pyproj.CRS] = None       # Calculated UTM CRS for buffering
        self.selected_stac_asset: Optional[StacAsset] = None   # The chosen NAIP STAC asset
        self.source_gsd: Optional[float] = None                # Ground Sample Distance of the asset
        self.processed_image_array: Optional[ImageArray] = None # The cropped image data as NumPy array

    def _generate_feature_id(self) -> str:
        """Generates a unique and robust feature identifier for logging and filenames."""
        fid = self.data.get('full_id') or f"noid_{self.data.get('id', f'index_{self.record_index}')}"
        return fid

    def _validate_input_record(self) -> bool:
        """Performs initial validation on the input substation record."""
        if not isinstance(self.data, dict):
            self.logger.warning(f"Skipping record {self.record_index + 1}: Input is not a dictionary ({type(self.data)}).")
            return False
        if 'geometry' not in self.data:
            self.logger.warning(f"Skipping record {self.feature_id}: Missing 'geometry' key.")
            return False
        if not isinstance(self.data['geometry'], dict):
             self.logger.warning(f"{self.feature_id}: 'geometry' data is not a dictionary ({type(self.data['geometry'])}), skipping.")
             return False
        return True

    def _prepare_geometry(self) -> bool:
        """
        Loads, validates, reprojects, and buffers the input geometry.

        Populates:
            - self.initial_geometry_ll
            - self.target_utm_crs
            - self.buffered_geometry_ll

        Returns:
            True if geometry preparation was successful, False otherwise.
        """
        try:
            # 1. Load geometry from GeoJSON-like dictionary into Shapely object
            raw_geom_data = self.data['geometry']
            self.initial_geometry_ll = shape(raw_geom_data)

            # 2. Validate the loaded geometry
            if not self.initial_geometry_ll or self.initial_geometry_ll.is_empty:
                self.logger.warning(f"{self.feature_id}: Input geometry is null or empty, skipping.")
                return False
            if not self.initial_geometry_ll.is_valid:
                # Here we could ptionally try to buffer(0) to fix invalid geometries, but for now, we skip but if we need to update down the line this is worth considering ie if Rahul needs a new var then our sizing could be updated to handle that logic
                self.logger.warning(f"{self.feature_id}: Input geometry is invalid (self_intersection, etc.), skipping.")
                return False

            # 3. Calculate the representative point and determine the appropriate UTM CRS
            rep_point = self.initial_geometry_ll.representative_point()
            self.target_utm_crs = calculate_utm_crs(rep_point.y, rep_point.x) # lat, lon

            # 4. Define coordinate transformation operations
            geo_crs = self.config["GEOSPATIAL"]["TARGET_GEOGRAPHIC_CRS"]
            transformer_ll_to_utm = pyproj.Transformer.from_crs(geo_crs, self.target_utm_crs, always_xy=True)
            transformer_utm_to_ll = pyproj.Transformer.from_crs(self.target_utm_crs, geo_crs, always_xy=True)

            # 5. Project to UTM, buffer in meters, project back to Lat/Lon
            geom_utm = shapely_transform(transformer_ll_to_utm.transform, self.initial_geometry_ll)
            buffer_distance = self.config["GEOSPATIAL"]["BUFFER_METERS"]
            geom_buf_utm = geom_utm.buffer(buffer_distance)
            self.buffered_geometry_ll = shapely_transform(transformer_utm_to_ll.transform, geom_buf_utm)

            self.logger.debug(f"{self.feature_id}: Geometry prepared successfully (Buffered in UTM Zone {self.target_utm_crs.utm_zone}).")
            return True

        except ValueError as e: # Catch errors from calculate_utm_crs
             self.logger.error(f"{self.feature_id}: Invalid coordinates for UTM calculation ({rep_point.y:.4f}, {rep_point.x:.4f}): {e}, skipping.")
             return False
        except ImportError:
             self.logger.critical(f"Import Error during geometry processing. Ensure Shapely and Pyproj are installed correctly.", exc_info=True)
             raise # Re-raise critical dependency errors
        except Exception as e:
            self.logger.error(f"{self.feature_id}: Failed during geometry preparation: {e}", exc_info=True)
            return False

    def _search_stac_for_imagery(self, stac_client: Client) -> bool:
        """
        Searches the STAC catalog for the latest NAIP imagery intersecting the buffered geometry.

        Args:
            stac_client: An initialized pystac_client.Client instance.

        Populates:
            - self.selected_stac_asset
            - self.source_gsd

        Returns:
            True if a suitable asset was found, False otherwise.
        """
        if not self.buffered_geometry_ll:
            self.logger.error(f"{self.feature_id}: Cannot search STAC without valid buffered geometry.")
            return False

        try:
            search_geom_geojson = self.buffered_geometry_ll.__geo_interface__
            search = stac_client.search(
                collections=[self.config["STAC"]["COLLECTION"]],
                intersects=search_geom_geojson,
                limit=self.config["STAC"]["SEARCH_LIMIT"]
            )
            # Get all items - note: search.items() returns a generator
            items = list(search.items())

            if not items:
                self.logger.warning(f"{self.feature_id}: No NAIP coverage found in STAC search.")
                return False

            # Find the item with the latest datetime (handle potential None datetimes)
            latest_item = max(items, key=lambda item: item.datetime or datetime.datetime.min)
            self.logger.debug(f"{self.feature_id}: Found {len(items)} items. Latest is from {latest_item.datetime}.")

            # Get the desired asset (e.g., the main 'image' asset)
            asset_key = self.config["STAC"]["ASSET_KEY"]
            self.selected_stac_asset = latest_item.assets.get(asset_key)

            if not self.selected_stac_asset:
                self.logger.warning(f"{self.feature_id}: Latest item found, but missing required asset key '{asset_key}'.")
                return False

            # Extract Ground Sample Distance (resolution) if available
            self.source_gsd = latest_item.properties.get('gsd')
            gsd_str = f"{self.source_gsd:.2f}m" if isinstance(self.source_gsd, (int, float)) else "unknown"
            self.logger.debug(f"{self.feature_id}: Selected asset '{asset_key}' (GSD: {gsd_str}) from URL: {self.selected_stac_asset.href}")
            return True

        except Exception as e:
            self.logger.error(f"{self.feature_id}: Error during STAC search: {e}", exc_info=True)
            return False

    def _extract_raster_chip(self) -> bool:
        """
        Opens the selected raster asset, reprojects the buffered geometry to the raster's CRS,
        calculates the window, reads the data, and performs necessary array manipulations.

        Populates:
            - self.processed_image_array

        Returns:
            True if raster processing was successful, False otherwise.
        """
        if not self.selected_stac_asset or not self.buffered_geometry_ll:
             self.logger.error(f"{self.feature_id}: Cannot process raster without selected asset or buffered geometry.")
             return False

        try:
            asset_href = self.selected_stac_asset.href
            self.logger.debug(f"{self.feature_id}: Opening raster asset: {asset_href}")

            with rasterio.open(asset_href) as src_dataset:
                source_crs = src_dataset.crs
                self.logger.debug(f"{self.feature_id}: Source raster CRS: {source_crs}")

                # Transform the *buffered geographic geometry* to the source raster's CRS
                transformer_ll_to_src = pyproj.Transformer.from_crs(
                    self.config["GEOSPATIAL"]["TARGET_GEOGRAPHIC_CRS"],
                    source_crs,
                    always_xy=True
                )
                geometry_in_source_crs = shapely_transform(transformer_ll_to_src.transform, self.buffered_geometry_ll)

                # Calculate the pixel window corresponding to the geometry in the source CRS
                try:
                    read_window = features.geometry_window(src_dataset, [geometry_in_source_crs.__geo_interface__])
                    self.logger.debug(f"{self.feature_id}: Calculated read window: {read_window}")
                except ValueError as e:
                    # This can happen if the geometry is completely outside the raster bounds
                    self.logger.warning(f"{self.feature_id}: Error calculating window (geometry likely outside raster bounds {src_dataset.bounds}?): {e}, skipping.")
                    return False

                # Read the data for the RGB bands (1, 2, 3) within the calculated window
                # Using boundless=True is generally safe when reading directly from source in this case the actual raw microsoft computer but I had issues as I described with tis variable so if you have runtime stuff that's pointing to this set to false!
                # and Also helps avoid errors if the window slightly crosses raster edges.
                raw_array = src_dataset.read(
                    indexes=(1, 2, 3), # Using standard RGB order in NAIP first bands
                    window=read_window,
                    out_dtype="uint8", # Standard image data type according to docs
                    resampling=self.config["GEOSPATIAL"]["DEFAULT_RESAMPLING"],
                    boundless=self.config["GEOSPATIAL"]["BOUNDLESS_READ"]
                ) # Shape: (Bands, Height, Width)

                # Validate the read array
                if raw_array.size == 0 or raw_array.shape[1] == 0 or raw_array.shape[2] == 0:
                     self.logger.warning(f"{self.feature_id}: Read an empty array from raster (window={read_window}), skipping.")
                     return False

                # Transpose the array from (Bands, Height, Width) to (Height, Width, Bands) for PIL/display
                self.processed_image_array = np.transpose(raw_array, (1, 2, 0))
                self.logger.debug(f"{self.feature_id}: Successfully read and transposed raster data. Shape: {self.processed_image_array.shape}")
                return True

        except WindowError as e:
            # This specific error might occur if boundless=False and window is out of bounds. So if you see this then the issue I had been descirbing is inverse
            self.logger.error(f"{self.feature_id}: WindowError during raster read (Window likely out of bounds): {e}", exc_info=True)
            return False
        except RasterioIOError as e:
            # General Rasterio I/O errors (e.g., network issues, file corruption)
            self.logger.error(f"{self.feature_id}: Rasterio IO Error reading {asset_href}: {e}", exc_info=True)
            return False
        except Exception as e:
            # Catch-all for any other unexpected errors during raster processing I never hit this error but I could see this be the case if the raw OSM was invalid for X reason
            self.logger.error(f"{self.feature_id}: Unexpected error processing raster {asset_href}: {e}", exc_info=True)
            return False

    def _save_output_image(self) -> bool:
        """
        Saves the processed image array to a PNG file.

        Returns:
            True if saving was successful, False otherwise.
        """
        if self.processed_image_array is None:
            self.logger.error(f"{self.feature_id}: Cannot save image, processed image array is missing.")
            return False

        try:
            output_folder = self.config["OUTPUT"]["IMAGE_FOLDER"]
            output_folder.mkdir(parents=True, exist_ok=True) # Ensure folder exists

            output_filename = f"{self.feature_id}.{self.config['OUTPUT']['IMAGE_FORMAT'].lower()}"
            output_path = output_folder / output_filename

            # Create PIL Image object from the NumPy array
            img = Image.fromarray(self.processed_image_array)

            # Save the image
            img.save(
                output_path,
                format=self.config["OUTPUT"]["IMAGE_FORMAT"],
                optimize=self.config["OUTPUT"]["OPTIMIZE_PNG"]
            )

            gsd_str = f"{self.source_gsd:.2f}m" if isinstance(self.source_gsd, (int, float)) else "unknown"
            self.logger.info(f"{self.feature_id}: ✅ Successfully saved image to {output_path.name} (GSD: {gsd_str})")
            return True

        except Exception as e:
            self.logger.error(f"{self.feature_id}: Failed to save output image {output_filename}: {e}", exc_info=True)
            return False

    def process(self, stac_client: Client) -> bool:
        """
        Executes the full processing pipeline for this substation record.

        Args:
            stac_client: Initialized pystac_client.Client instance.

        Returns:
            True if the entire process completed successfully, False otherwise.
        """
        self.logger.info(f"--- Processing record {self.record_index + 1}: {self.feature_id} ---")

        # Chain the processing steps, returning False if any step fails.
        if not self._validate_input_record():
            return False
        if not self._prepare_geometry():
            return False
        if not self._search_stac_for_imagery(stac_client):
            # No coverage is a common case, not necessarily an error, but stops processing this feature. let me know if this handling makes sense
            return False # Returning False indicates processing didn't complete with an image.
        if not self._extract_raster_chip():
            return False
        if not self._save_output_image():
            return False

        # If all steps passed
        return True

# --- Main Execution Logic ---
def main():
    """Main function to orchestrate the data loading and processing workflow."""
    logger.info("=== Starting Substation NAIP Image Processing Workflow ===")

    # --- Load Data ---
    try:
        if CONFIG["INPUT_DATA"]["SOURCE_TYPE"] == "json":
            input_file = CONFIG["INPUT_DATA"]["JSON_FILE_PATH"]
            all_substation_data = SubstationDataLoader.load_from_json(input_file)
        else:
            logger.error(f"Unsupported input data source type: {CONFIG['INPUT_DATA']['SOURCE_TYPE']}")
            sys.exit(1)
    except Exception as e:
        logger.critical(f"Failed to load input data. Terminating workflow. Error: {e}", exc_info=True)
        sys.exit(1)

    if not all_substation_data:
        logger.warning("Input data source is empty. No substations to process.")
        sys.exit(0)

    # --- Initialize STAC Client ---
    try:
        stac_catalog_url = CONFIG["STAC"]["CATALOG_URL"]
        logger.info(f"Initializing STAC client for catalog: {stac_catalog_url}")
        stac_client = Client.open(stac_catalog_url)
        logger.info("STAC client initialized successfully.")
    except Exception as e:
        logger.critical(f"Failed to initialize STAC client. Terminating workflow. Error: {e}", exc_info=True)
        sys.exit(1)

    # --- Process Each Substation ---
    total_records = len(all_substation_data)
    success_count = 0
    failure_count = 0
    no_coverage_count = 0 # Track separately cases where no NAIP tile was found

    logger.info(f"Beginning processing for {total_records} substation records...")

    for index, record in enumerate(all_substation_data):
        processor = SubstationImageProcessor(index, record, CONFIG)
        try:
            # The process method returns True on full success, False otherwise.
            # We need to distinguish between failures and simple "no coverage".
            # A more robust way might involve specific return codes or exceptions from process().
            # For now, we assume a False return after _search_stac_for_imagery means no coverage. But that's a misnomer! just fyi
            if processor.process(stac_client):
                success_count += 1
            else:
                # Check if the failure occurred because no asset was found
                # This is a bit heuristic based on the state after process() returns False
                if processor.buffered_geometry_ll is not None and processor.selected_stac_asset is None:
                     no_coverage_count += 1
                else:
                     failure_count += 1 # Assume other failures are processing errors .... may not be ideal lol but ok for now

        except Exception as e:
            # Catch unexpected errors during the main loop invocation itself
            logger.error(f"Critical error during processing loop for record {processor.feature_id}: {e}", exc_info=True)
            failure_count += 1

    # --- Final Summary ---
    logger.info("=== Processing Workflow Complete ===")
    logger.info(f"Total records processed: {total_records}")
    logger.info(f"Successfully generated images: {success_count}")
    logger.info(f"Records skipped due to no NAIP coverage: {no_coverage_count}")
    logger.info(f"Records failed due to processing errors: {failure_count}")
    logger.info("===================================")

if __name__ == "__main__":
    #  & run :)
    main()