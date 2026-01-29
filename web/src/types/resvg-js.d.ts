// Minimal ambient types for @resvg/resvg-js to satisfy the compiler.
// If upstream adds types, this file can be removed.

declare module '@resvg/resvg-js' {
  interface ResvgRenderResult {
    asPng(): Buffer;
    asJpeg?(opts?: { quality?: number }): Buffer;
    asWebp?(opts?: { quality?: number }): Buffer;
  }
  interface ResvgOptions {
    fitTo?: { mode: 'width' | 'height' | 'zoom' | 'original'; value: number };
  }
  export class Resvg {
    constructor(svg: string, opts?: ResvgOptions);
    render(): ResvgRenderResult;
  }
}
