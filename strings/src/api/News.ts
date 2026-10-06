import { apiFetchJson } from './client'

// TODO: implement when news API is ready
export const getNews = async (): Promise<unknown[]> => {
  return apiFetchJson<unknown[]>('/api/news')
}
