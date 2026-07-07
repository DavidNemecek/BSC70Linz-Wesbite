export type HallId = 'solarcity' | 'auhof'

interface HallDirections {
  lat: number
  lng: number
  mapsUrl: string
  overviewImage: string
}

export const hallDirections: Record<HallId, HallDirections> = {
  solarcity: {
    lat: 48.25648048297351,
    lng: 14.3625990774601,
    mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=48.25648048297351,14.3625990774601',
    overviewImage: '/assets/Overview_Solarcity.jpeg',
  },
  auhof: {
    lat: 48.333212999976354,
    lng: 14.322112572738126,
    mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=48.333212999976354,14.322112572738126',
    overviewImage: '/assets/Overview_Auhof.jpeg',
  },
}
