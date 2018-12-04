export interface ReadableBuffer {
    readBytes(length: number): ArrayBufferLike;
    addUnorderedSet(chunks: ArrayBufferLike[]): void;
}
declare abstract class BufferReader {
    private readonly buffer;
    private readPosition;
    constructor(buffer: ArrayBufferLike);
    readBytes(length: number): ArrayBufferLike;
}
export declare class ReorderingReader extends BufferReader implements ReadableBuffer {
    private possibilities;
    private groupValues;
    readBytes(length: number): ArrayBuffer | SharedArrayBuffer;
    addUnorderedSet(chunks: ArrayBufferLike[]): void;
}
export declare function decode(length: number, indices: number[]): bigint;
export {};
