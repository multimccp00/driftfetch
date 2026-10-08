export const fixtureManifest = {
  apiVersion: 1,
  id: "landscapes",
  name: "Landscape samples",
  version: "1.0.0",
  domains: ["example.invalid"],
  account: {
    label: "API credentials",
    kind: "api",
    fields: [
      { key: "apiKey", label: "API key", secret: true, required: true },
      { key: "userId", label: "User ID", secret: false, required: true },
    ],
  },
};
export const fixtureCode = `
const metadata = {title:'Landscapes', entries:[{id:'1',title:'Landscape',url:'https://example.invalid/landscape.png'}], sourceItemCount: 1};
module.exports = {
  matches: url => new URL(url).pathname === '/landscapes',
  async resolve(url, context) {
    const values = await context.credentials();
    if(values.apiKey === 'FAIL') throw new Error('HTTP 403 SECRET');
    return metadata;
  },
  async fallback() { return metadata; },
  galleryArguments: values => ['--option', 'extractor.example.api-key=' + values.apiKey]
};`;
export const fixturePackage = JSON.stringify({
  manifest: fixtureManifest,
  code: fixtureCode,
});
