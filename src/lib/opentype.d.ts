// The opentype.js fork Satori lays text out with (pinned in package.json to Satori's version), used by ./og.ts to
// measure labels the way Satori will draw them. Only what ./og.ts calls is declared.
declare module '@shuding/opentype.js' {
  export interface Font { getAdvanceWidth(text: string, fontSize: number): number }
  const opentype: { parse(buffer: ArrayBuffer): Font };
  export default opentype;
}
