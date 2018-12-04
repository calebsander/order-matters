export interface LookupResult {
    index: number;
    newArray: HoleyArray;
}
export interface HoleyArray {
    readonly length: number;
    readonly totalHoles: number;
    lookup(lookupIndex: number): LookupResult;
}
export declare const makeHoleyArray: (length: number, reverse: boolean) => HoleyArray;
