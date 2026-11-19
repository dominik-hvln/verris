/**
 * Paczka 131 – minimalne typy biblioteki fontkit 2.0.4 (MIT, https://github.com/foliojs/fontkit) – tylko to, czego
 * używa Kreator marki (napis na krzywych z kerningiem: kreator-marki/napis-marki.ts). Pakiet nie ma własnych typów.
 */
declare module 'fontkit' {
  export interface FontkitPath {
    toSVG(): string;
    commands: { command: string; args: number[] }[];
  }

  export interface FontkitGlyph {
    id: number;
    codePoints: number[];
    path: FontkitPath;
    advanceWidth: number;
  }

  export interface FontkitPosition {
    xAdvance: number;
    yAdvance: number;
    xOffset: number;
    yOffset: number;
  }

  export interface FontkitGlyphRun {
    glyphs: FontkitGlyph[];
    positions: FontkitPosition[];
    advanceWidth: number;
  }

  export interface FontkitFont {
    unitsPerEm: number;
    ascent: number;
    descent: number;
    capHeight: number;
    xHeight: number;
    familyName: string;
    hasGlyphForCodePoint(codePoint: number): boolean;
    layout(text: string, features?: string[] | Record<string, boolean>): FontkitGlyphRun;
  }

  export function create(buffer: Buffer | Uint8Array, postscriptName?: string): FontkitFont;
}
