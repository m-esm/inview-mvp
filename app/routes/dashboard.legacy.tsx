import { redirect } from 'react-router'
import { O_SLUG } from '../lib/galleries'
export function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  if (params.slug !== O_SLUG) throw new Response('Not found', { status: 404 })
  return redirect(`/staff/${O_SLUG}${new URL(request.url).search}`, 302)
}
