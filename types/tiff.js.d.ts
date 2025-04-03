declare module 'tiff.js' {
  export default class Tiff {
    constructor(buffer: ArrayBuffer);
    toCanvas(): HTMLCanvasElement;
  }
} 