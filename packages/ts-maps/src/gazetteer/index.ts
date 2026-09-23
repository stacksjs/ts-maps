// ts-maps/gazetteer — self-hosted place search for Bun servers.
//
//   const sources = await downloadGeoNames({ dataset: 'cities1000' })
//   buildGazetteerFile('places.sqlite', sources)
//   const gazetteer = new Gazetteer('places.sqlite')
//   Bun.serve({ fetch: createGazetteerHandler(gazetteer, { basePath: '/geo' }) })
//
// and in the browser: `new GazetteerGeocoder({ baseUrl: '/geo' })` from
// `ts-maps/services`. Server-only: this entry point uses `bun:sqlite`.

export {
  buildGazetteer,
  buildGazetteerFile,
  Gazetteer,
  haversineKm,
  normalizePlaceText,
} from './gazetteer'
export type { BuildGazetteerOptions, GazetteerPlaceProperties, GazetteerSearchOptions } from './gazetteer'

export {
  downloadGeoNames,
  GEONAMES_ATTRIBUTION,
  parseGeoNamesAdmin1,
  parseGeoNamesCities,
  parseGeoNamesCountries,
  readZipEntry,
} from './geonames'
export type { DownloadGeoNamesOptions, GeoNamesDataset, GeoNamesPlace, GeoNamesSources } from './geonames'

export { createGazetteerHandler, parseGazetteerQuery } from './handler'
export type { GazetteerHandlerOptions, GazetteerQuery } from './handler'
