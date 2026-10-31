import Profile from '~/pages/visitor/Profile'

export function headers() {
  return { 'Cache-Control': 'no-store' }
}

export default function Me() {
  return <Profile />
}
