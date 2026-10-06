import type { ApiPost, UserProfile } from '../../../api/types'
import { mapAuthorFirstName } from './mapEvent'

export type AnnouncementAuthor = {
  id: string
  name: string
  avatar: string
}

export type AnnouncementRespondent = {
  id: string
  name: string
  avatar: string
}

/** UI-модель объявления (= post) */
export type Announcement = {
  id: string
  title: string
  description: string
  author: AnnouncementAuthor
  createdAt: string
  isOwn?: boolean
  isResponded?: boolean
  isArchived?: boolean
  respondents?: AnnouncementRespondent[]
}

export const mapUserToRespondent = (user: UserProfile): AnnouncementRespondent => ({
  id: user.id,
  name: mapAuthorFirstName(user),
  avatar: user.photoUrl || '',
})

export const mapApiPostToUi = (
  post: ApiPost,
  opts?: { meId?: string | null; respondedIds?: Set<string> },
): Announcement => {
  const author = post.author
  const authorId = author?.id ?? ''
  const rawContent = post.content?.trim() ?? ''
  const description = rawContent === '—' ? '' : rawContent
  return {
    id: post.id,
    title: post.title,
    description,
    author: {
      id: authorId,
      name: mapAuthorFirstName(author),
      avatar: author?.photoUrl || '',
    },
    createdAt: post.createdAt,
    isOwn: Boolean(opts?.meId && authorId === opts.meId),
    isResponded: opts?.respondedIds?.has(post.id) ?? false,
    isArchived: post.isArchived,
    respondents: [],
  }
}
