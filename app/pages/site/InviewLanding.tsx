import { Link } from 'react-router'
import { StaffLangSwitch } from '../../components/StaffLangSwitch'
import { useLang } from '../../lib/i18n'
import { landingContact } from '../../lib/landing-contact'

export const landingCopy = {
  fa: {
    title: 'اینویو | آثار گالری شما، در دست بازدیدکننده',
    description: 'با اینویو، بازدیدکننده کد QR گالری را اسکن می‌کند و آثار و قیمت‌ها را روی گوشی می‌بیند. برای گالری‌ها، از معرفی آثار تا شناخت علاقه‌مندان.',
    brand: 'اینویو',
    forGalleries: 'برای گالری‌ها',
    hero: 'آثار گالری شما، در دست بازدیدکننده.',
    intro: 'اینویو با یک کد QR، آثار نمایشگاه و قیمت‌ها را روی گوشی بازدیدکننده می‌آورد.',
    demo: 'دیدن نمونه گالری اُ',
    contact: 'گفت‌وگو درباره گالری شما',
    noApp: 'بدون نصب اپلیکیشن. به فارسی و انگلیسی.',
    preview: 'از دیوار گالری تا صفحه گوشی',
    previewCaption: 'پیش‌نمایش نسخه آزمایشی گالری اُ',
    how: 'از ثبت اثر تا یک اسکن',
    steps: [
      ['آثار را اضافه کنید', 'عکس، مشخصات و قیمت هر اثر را در پنل گالری وارد کنید.'],
      ['کد QR را چاپ کنید', 'کد نمایشگاه را کنار ورودی یا روی دیوار گالری قرار دهید.'],
      ['بازدیدکننده اسکن می‌کند', 'آثار را می‌بیند، قیمت‌ها را بررسی می‌کند و اثر دلخواهش را ذخیره می‌کند.'],
    ],
    benefits: 'یک نمایشگاه، ارتباطی ماندگار',
    benefitsIntro: 'معرفی آثار در زمان بازدید، شناخت علاقه‌مندان پس از آن.',
    features: [
      ['راهنمای بازدید روی گوشی', 'آثار، هنرمندان و اطلاعات نمایشگاه، همیشه همراه بازدیدکننده.'],
      ['فهرست قیمت به‌روز', 'قیمت و وضعیت فروش هر اثر را از پنل گالری تغییر دهید.'],
      ['گزارش بازدید و علاقه‌مندی', 'تعداد اسکن‌ها و بازدید آثار را ببینید و علاقه‌مندی‌ها را بشناسید.'],
      ['اطلاعات تماس، با رضایت', 'اطلاعات علاقه‌مندان فقط با رضایت خودشان در اختیار گالری قرار می‌گیرد.'],
    ],
    proof: 'گالری اُ، روی گوشی',
    proofIntro: 'تصویرهایی از نسخه آزمایشی با داده‌های نمونه؛ همان مسیری که بازدیدکننده از معرفی نمایشگاه تا فهرست قیمت طی می‌کند.',
    screens: ['ورود به نمایشگاه', 'دیدن آثار', 'مشخصات و قیمت اثر', 'فهرست قیمت'],
    contactTitle: 'برای نمایشگاه بعدی شما',
    contactIntro: 'درباره گالری و نمایشگاه بعدی‌تان بگویید. با هم راه‌اندازی اینویو را بررسی می‌کنیم.',
    whatsapp: 'واتس‌اپ',
    telegram: 'تلگرام',
    phone: 'تماس تلفنی',
    staff: 'ورود کارکنان گالری',
    footer: 'همراه آثار، همراه گالری.',
  },
  en: {
    title: 'Inview | Your gallery, in your visitor’s hands',
    description: 'Visitors scan one QR code to see your gallery’s works and prices on their phone. Inview helps galleries present art and connect with interested visitors.',
    brand: 'Inview',
    forGalleries: 'For galleries',
    hero: 'Your gallery, in your visitor’s hands.',
    intro: 'Inview brings your exhibition’s works and prices to each visitor’s phone with one QR code.',
    demo: 'Explore the O Gallery demo',
    contact: 'Talk about your gallery',
    noApp: 'No app to install. In Persian and English.',
    preview: 'From the gallery wall to the phone',
    previewCaption: 'A preview of the O Gallery pilot',
    how: 'From adding a work to a scan',
    steps: [
      ['Add your works', 'Enter each work’s image, details and price in your gallery editor.'],
      ['Print your QR code', 'Place your exhibition’s code at the entrance or on the gallery wall.'],
      ['Visitors scan and explore', 'They browse the works, check prices and save the art that interests them.'],
    ],
    benefits: 'An exhibition. A lasting connection.',
    benefitsIntro: 'Present the works during a visit. Understand interest after it.',
    features: [
      ['A visitor guide on every phone', 'Works, artists and exhibition details, all in one place.'],
      ['An up-to-date price list', 'Change each work’s price and sale status in your gallery editor.'],
      ['Scans and interest reports', 'See scan counts, work views and which works visitors save.'],
      ['Contact details, with consent', 'Receive interested visitors’ contact details only when they agree to share them.'],
    ],
    proof: 'O Gallery, on a phone',
    proofIntro: 'Screens from the pilot with sample catalogue data. Follow the visitor’s path from the exhibition welcome to the price list.',
    screens: ['Exhibition welcome', 'Browse the works', 'Work details and price', 'The price list'],
    contactTitle: 'For your next exhibition',
    contactIntro: 'Tell us about your gallery and your next show. We’ll walk through how to get started with Inview.',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    phone: 'Call us',
    staff: 'Gallery staff sign-in',
    footer: 'With the art. With the gallery.',
  },
}

const screens = ['welcome', 'works', 'work', 'prices'] as const

function PilotScreen({ screen, alt }: { screen: (typeof screens)[number]; alt: string }) {
  return (
    <picture>
      <source srcSet={`/landing/${screen}.webp`} type="image/webp" />
      <img src={`/landing/${screen}.png`} alt={alt} width={540} height={1169} loading="eager" />
    </picture>
  )
}

export default function InviewLanding() {
  const lang = useLang()
  const words = landingCopy[lang]
  const number = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US')
  const phone = landingContact.phone.replace(/\d/g, (digit) => number.format(Number(digit)))

  return (
    <div className={`landing ${lang === 'fa' ? 'fa' : ''}`}>
      <header className="landing-header landing-width">
        <Link to="/" className="landing-brand">{words.brand}</Link>
        <span>{words.forGalleries}</span>
      </header>
      <main>
        <section className="landing-hero landing-width" aria-labelledby="landing-title">
          <div className="landing-intro">
            <h1 id="landing-title">{words.hero}</h1>
            <p className="landing-lead">{words.intro}</p>
            <div className="landing-actions">
              <Link className="btn btn-primary" to="/g/o-gallery">{words.demo}</Link>
              <a className="btn btn-outline" href="#contact">{words.contact}</a>
            </div>
            <p className="landing-note">{words.noApp}</p>
          </div>
          <figure className="landing-exhibit">
            <span className="landing-exhibit-label">{words.preview}</span>
            <div className="landing-phone">
              <PilotScreen screen="welcome" alt={words.screens[0]} />
            </div>
            <figcaption>{words.previewCaption}</figcaption>
          </figure>
        </section>

        <section className="landing-section landing-width landing-how" aria-labelledby="landing-how">
          <h2 id="landing-how">{words.how}</h2>
          <ol className="landing-steps">
            {words.steps.map(([title, body], index) => (
              <li key={title}>
                <span className="landing-step-number" aria-hidden="true">{number.format(index + 1)}</span>
                <div><h3>{title}</h3><p>{body}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-benefits" aria-labelledby="landing-benefits">
          <div className="landing-width landing-benefits-layout">
            <div className="landing-section-intro">
              <h2 id="landing-benefits">{words.benefits}</h2>
              <p>{words.benefitsIntro}</p>
            </div>
            <dl className="landing-features">
              {words.features.map(([title, body]) => (
                <div key={title}><dt>{title}</dt><dd>{body}</dd></div>
              ))}
            </dl>
          </div>
        </section>

        <section className="landing-section landing-width" aria-labelledby="landing-proof">
          <div className="landing-proof-heading">
            <div className="landing-section-intro">
              <h2 id="landing-proof">{words.proof}</h2>
              <p>{words.proofIntro}</p>
            </div>
            <Link className="btn btn-outline" to="/g/o-gallery">{words.demo}</Link>
          </div>
          <div className="landing-screens">
            {screens.map((screen, index) => (
              <figure key={screen}>
                <div className="landing-screen"><PilotScreen screen={screen} alt={words.screens[index]} /></div>
                <figcaption>{words.screens[index]}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="landing-contact landing-width" id="contact" aria-labelledby="landing-contact">
          <div className="landing-section-intro">
            <h2 id="landing-contact">{words.contactTitle}</h2>
            <p>{words.contactIntro}</p>
          </div>
          <div className="landing-contact-links">
            <a className="btn btn-primary" href={landingContact.whatsappUrl}>{words.whatsapp}</a>
            <a className="btn btn-outline" href={landingContact.telegramUrl}>{words.telegram}</a>
            <a className="landing-phone-link" href={`tel:${landingContact.phone.replace(/\s/g, '')}`}>
              <span>{words.phone}</span><bdi dir="ltr">{phone}</bdi>
            </a>
          </div>
        </section>
      </main>
      <footer className="landing-footer landing-width">
        <div><span className="landing-brand">{words.brand}</span><p>{words.footer}</p></div>
        <StaffLangSwitch />
        <Link className="landing-staff" to="/dashboard/sign-in">{words.staff}</Link>
      </footer>
    </div>
  )
}
