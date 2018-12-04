export interface WritableBuffer {
    writeBytes(bytes: ArrayBufferLike): void;
    writeUnordered(chunks: ArrayBufferLike[]): void;
    toBuffer(): ArrayBufferLike;
}
declare abstract class ChunkedBuffer {
    protected readonly chunks: ArrayBufferLike[];
    writeBytes(bytes: ArrayBufferLike): void;
    abstract writeUnordered(chunks: ArrayBufferLike[]): void;
    toBuffer(): ArrayBuffer | SharedArrayBuffer;
}
export declare class ReorderingBuffer extends ChunkedBuffer implements WritableBuffer {
    private possibilities;
    private sets;
    private currentSet;
    private currentGroup;
    writeUnordered(chunks: ArrayBufferLike[]): void;
    toBuffer(): ArrayBuffer | SharedArrayBuffer;
}
export declare function encode(length: number, elements: number, value: bigint): number[];
export {};
