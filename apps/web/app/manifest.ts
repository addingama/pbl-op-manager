import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PBL Open Play',
    short_name: 'PBL Open Play',
    description: 'Padel open play sessions and Elo leaderboard',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#047857',
    lang: 'en',
  };
}
