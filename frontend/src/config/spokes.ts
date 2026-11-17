export interface SpokeConfig {
  id: string
  name: string
  description: string
  adminApiBaseUrl: string
}

export const spokes: SpokeConfig[] = [
  {
    id: 'blockbuster-theatre',
    name: 'Blockbuster Theatre',
    description: 'Cinema bookings and movie services',
    adminApiBaseUrl: import.meta.env.VITE_BLOCKBUSTER_ADMIN_API_BASE_URL ||
      'https://api.blockbuster-theatre.nml-applications.com/admin',
  },
]
