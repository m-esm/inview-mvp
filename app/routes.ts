import {
  type RouteConfig,
  index,
  layout,
  route,
} from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('site/:slug', 'routes/site.$slug.tsx'),
  layout('routes/g.tsx', [
    route('g/:slug', 'routes/g.$slug._index.tsx'),
    route('g/:slug/works', 'routes/g.$slug.works._index.tsx'),
    route('g/:slug/works/:id', 'routes/g.$slug.works.$id.tsx'),
    route('g/:slug/prices', 'routes/g.$slug.prices.tsx'),
    route('g/:slug/about', 'routes/g.$slug.about.tsx'),
    route('me', 'routes/me.tsx'),
  ]),
  route('dashboard', 'routes/dashboard.tsx', [
    index('routes/dashboard._index.tsx'),
    route('artworks', 'routes/dashboard.artworks.tsx'),
    route('audience', 'routes/dashboard.audience.tsx'),
    route('website', 'routes/dashboard.website.tsx'),
    route('plans', 'routes/dashboard.plans.tsx'),
    route('o-gallery', 'routes/dashboard.o-gallery.tsx'),
  ]),
  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig
