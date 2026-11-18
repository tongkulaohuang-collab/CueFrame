// Chromium's retained raster surfaces can differ by a few pixel values when
// pages receive different frame histories. A single page gives both export
// paths the same ordered history; explicit parallel rendering remains opt-in.
export function renderConcurrency(value){
 const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=8?n:1;
}
