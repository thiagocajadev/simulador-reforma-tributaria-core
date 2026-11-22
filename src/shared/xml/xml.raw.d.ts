// The `?raw` imports of the XSD files (xml.schema.ts), typed for the node test project, which has
// no vite/client types; the app project gets the same declaration from vite/client.
declare module "*?raw" {
  const contents: string;
  export default contents;
}
