import iconUrl from '~/assets/icon.png'

interface IconProps {
  size: number
}

export function BrandIcon({ size }: IconProps) {
  return (
    <img
      src={iconUrl}
      width={size}
      height={size}
      alt="Aiction"
      aria-hidden="true"
      style={{ borderRadius: '20%' }}
    />
  )
}
