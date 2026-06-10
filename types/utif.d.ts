declare module "utif" {
  interface Ifd {
    width: number;
    height: number;
    [key: string]: unknown;
  }

  const UTIF: {
    decode(buffer: ArrayBuffer): Ifd[];
    decodeImage(buffer: ArrayBuffer, ifd: Ifd): void;
    toRGBA8(ifd: Ifd): Uint8Array;
    encodeImage(rgba: Uint8Array, width: number, height: number, metadata?: unknown): Uint8Array;
  };

  export default UTIF;
}

declare module "upng-js" {
  const UPNG: {
    encode(
      bufs: ArrayBufferLike[],
      w: number,
      h: number,
      ps: number,
      dels?: number[],
      forbidPlte?: boolean
    ): ArrayBuffer;
  };
  export default UPNG;
}
