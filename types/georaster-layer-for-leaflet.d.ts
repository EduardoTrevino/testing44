declare module 'georaster-layer-for-leaflet' {
  import { Layer, LatLngBounds } from 'leaflet';
  import { GeoRaster } from 'georaster';

  interface GeoRasterLayerOptions {
    georaster: GeoRaster;
    opacity?: number;
    resolution?: number;
    debugLevel?: number;
    pane?: string;
    pixelPerfect?: bool;
  }

  export default class GeoRasterLayer extends Layer {
    constructor(options: GeoRasterLayerOptions);
    getBounds(): LatLngBounds;
  }
} 