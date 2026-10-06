import type { ReactElement, SVGProps } from 'react'
import type { SocialNetworkId } from '../../../entities/profile/model/types'
import BehanceIcon from '../../../assets/components/behance'
import GithubIcon from '../../../assets/components/github'
import LinkedinIcon from '../../../assets/components/linkedin'
import MaxIcon from '../../../assets/components/max'
import TgIcon from '../../../assets/components/tg'
import TimeIcon from '../../../assets/components/time'
import VkIcon from '../../../assets/components/vk'

type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement

const SOCIAL_ICONS: Record<SocialNetworkId, IconComponent> = {
  telegram: TgIcon,
  tg_channel: TgIcon,
  github: GithubIcon,
  vk: VkIcon,
  linkedin: LinkedinIcon,
  behance: BehanceIcon,
  max: MaxIcon,
  time: TimeIcon,
}

type SocialNetworkIconProps = SVGProps<SVGSVGElement> & {
  networkId: SocialNetworkId
}

export const SocialNetworkIcon = ({ networkId, ...props }: SocialNetworkIconProps) => {
  const Icon = SOCIAL_ICONS[networkId]
  return <Icon {...props} />
}
