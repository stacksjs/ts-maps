// A small GeoNames extract with the collisions a place search has to get
// right: two San Diegos, two Portlands, Paris in France and Texas, and cities
// most people spell differently from the local name.

import type { GeoNamesSources } from '../../src/gazetteer'

function row(
  id: number,
  name: string,
  ascii: string,
  alternates: string,
  lat: number,
  lng: number,
  country: string,
  admin1: string,
  population: number,
  timezone: string,
): string {
  // 19 tab-separated columns, as in citiesN.txt.
  return [id, name, ascii, alternates, lat, lng, 'P', 'PPL', country, '', admin1, '', '', '', population, '', '10', timezone, '2024-01-01'].join('\t')
}

export const cities: string = [
  row(5391811, 'San Diego', 'San Diego', 'SAN,San Diegas,Сан-Диего', 32.71571, -117.16472, 'US', 'CA', 1394928, 'America/Los_Angeles'),
  row(5391832, 'San Diego Country Estates', 'San Diego Country Estates', '', 33.00, -116.78, 'US', 'CA', 10109, 'America/Los_Angeles'),
  row(4726491, 'San Diego', 'San Diego', '', 27.76391, -98.23890, 'US', 'TX', 4488, 'America/Chicago'),
  row(5746545, 'Portland', 'Portland', 'PDX', 45.52345, -122.67621, 'US', 'OR', 652503, 'America/Los_Angeles'),
  row(4975802, 'Portland', 'Portland', 'PWM', 43.66147, -70.25533, 'US', 'ME', 68408, 'America/New_York'),
  row(2867714, 'München', 'Munchen', 'Munich,Monaco di Baviera,Мюнхен', 48.13743, 11.57549, 'DE', '02', 1260391, 'Europe/Berlin'),
  row(2988507, 'Paris', 'Paris', 'Lutetia,Parigi', 48.85341, 2.3488, 'FR', '11', 2138551, 'Europe/Paris'),
  row(4717560, 'Paris', 'Paris', '', 33.66094, -95.55551, 'US', 'TX', 24782, 'America/Chicago'),
  row(4250542, 'Springfield', 'Springfield', '', 39.80172, -89.64371, 'US', 'IL', 114394, 'America/Chicago'),
  row(4409896, 'Springfield', 'Springfield', '', 37.21533, -93.29824, 'US', 'MO', 169176, 'America/Chicago'),
  row(2657896, 'Zürich', 'Zurich', 'Zuerich,Zurigo', 47.36667, 8.55, 'CH', 'ZH', 341730, 'Europe/Zurich'),
  row(5546220, 'Saint George', 'Saint George', 'St. George,St George', 37.10415, -113.58412, 'US', 'UT', 89587, 'America/Denver'),
  row(6155033, 'St. George', 'St. George', '', 43.24, -80.25, 'CA', '08', 3124, 'America/Toronto'),
  row(5099836, 'Mount Holly', 'Mount Holly', '', 39.99, -74.79, 'US', 'NJ', 9536, 'America/New_York'),
  row(1642911, 'Jakarta', 'Jakarta', 'Batavia,New Amsterdam of the East', -6.21, 106.85, 'ID', '04', 8540121, 'Asia/Jakarta'),
  'not\ta\tvalid\tline',
  '',
].join('\n')

export const admin1: string = [
  'US.CA\tCalifornia\tCalifornia\t5332921',
  'US.TX\tTexas\tTexas\t4736286',
  'US.OR\tOregon\tOregon\t5744337',
  'US.ME\tMaine\tMaine\t4971068',
  'US.IL\tIllinois\tIllinois\t4896861',
  'US.MO\tMissouri\tMissouri\t4398678',
  'DE.02\tBavaria\tBavaria\t2951839',
  'FR.11\tÎle-de-France\tIle-de-France\t3012874',
  'CH.ZH\tZurich\tZurich\t2657895',
  'US.UT\tUtah\tUtah\t5549030',
].join('\n')

export const countries: string = [
  '# ISO\tISO3\tISO-Numeric\tfips\tCountry\tCapital',
  'US\tUSA\t840\tUS\tUnited States\tWashington',
  'DE\tDEU\t276\tGM\tGermany\tBerlin',
  'FR\tFRA\t250\tFR\tFrance\tParis',
  'CH\tCHE\t756\tSZ\tSwitzerland\tBern',
].join('\n')

export const sources: GeoNamesSources = { cities, admin1, countries }
