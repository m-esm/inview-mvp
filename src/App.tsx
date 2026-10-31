import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { gallery } from './data/gallery'
import { VisitorShell } from './components/VisitorShell'
import Welcome from './pages/visitor/Welcome'
import Works from './pages/visitor/Works'
import Work from './pages/visitor/Work'
import Prices from './pages/visitor/Prices'
import About from './pages/visitor/About'
import Profile from './pages/visitor/Profile'
import GalleryLayout from './pages/gallery/GalleryLayout'
import { ArtworkInterest, Audience, Overview } from './pages/gallery/Dashboard'
import Import from './pages/gallery/Import'
import Plans from './pages/gallery/Plans'
import OGalleryEditor from './pages/gallery/OGalleryEditor'
import Website from './pages/site/Website'

// On roozgallery.inview.ir the home page is the gallery's website.
const host = typeof window !== 'undefined' ? window.location.hostname : ''
const isGallerySite = host.endsWith('.inview.ir') && host.split('.')[0] === gallery.subdomain

function NotFound() {
  return (
    <div className="pad empty">
      <h1 className="page-title">This page doesn’t exist</h1>
      <p className="muted">Scan the QR code at the gallery again, or open the current show.</p>
      <Link className="btn btn-primary" to={`/g/${gallery.slug}`}>Open the show</Link>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={isGallerySite ? <Website /> : <Navigate to={`/g/${gallery.slug}`} replace />} />
      <Route path="/site/:slug" element={<Website />} />
      <Route element={<VisitorShell />}>
        <Route path="/g/:slug" element={<Welcome />} />
        <Route path="/g/:slug/works" element={<Works />} />
        <Route path="/g/:slug/works/:id" element={<Work />} />
        <Route path="/g/:slug/prices" element={<Prices />} />
        <Route path="/g/:slug/about" element={<About />} />
        <Route path="/me" element={<Profile />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="/dashboard" element={<GalleryLayout />}>
        <Route index element={<Overview />} />
        <Route path="artworks" element={<ArtworkInterest />} />
        <Route path="audience" element={<Audience />} />
        <Route path="website" element={<Import />} />
        <Route path="plans" element={<Plans />} />
        <Route path="o-gallery" element={<OGalleryEditor />} />
      </Route>
    </Routes>
  )
}
