import { redirect } from 'react-router'
export function loader({ request }: { request: Request }) {
  return redirect(`/staff/sign-in${new URL(request.url).search}`, 302)
}
