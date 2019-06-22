export interface LookupResult {
    index: number;
    newArray: HoleyArray;
}
export interface HoleyArray {
    readonly spaces: number;
    lookup(lookupIndex: number, reverse: boolean): LookupResult;
}
export declare const makeHoleyArray: (length: number) => HoleyArray;
