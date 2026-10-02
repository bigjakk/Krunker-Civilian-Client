// Krunker's official maps by id (also each map's preview image index); ids match gapi.svc.krunker.io/maps.
export const OFFICIAL_MAPS: readonly string[] = [
  'Burg', 'Littletown', 'Sandstorm', 'Subzero', 'Undergrowth', 'Shipment', 'Freight', 'Lostworld', 'Citadel', 'Oasis',
  'Kanji', 'Industry', 'Lumber', 'Evacuation', 'Site', 'SkyTemple', 'Lagoon', 'Bureau', 'Tortuga', 'Tropicano',
  'Krunk_Plaza', 'Arena', 'Habitat', 'Atomic', 'Old_Burg', 'Throwback', 'Stockade', 'Facility', 'Clockwork', 'Laboratory',
  'Shipyard', 'Soul Sanctum', 'Bazaar', 'Erupt', 'HQ', 'Khepri', 'Lush', 'Vivo', 'Slide Moonlight', 'Eterno Simulator',
  'Stalk Factory', 'Eterno Jump', 'Frontier', 'Bastion', 'Piazza', 'Barnyard',
];

export function mapImageUrl(id: number): string {
  return `https://assets.krunker.io/img/maps/map_${id}.png`;
}
