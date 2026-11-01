import { useLocation, useRouteLoaderData } from 'react-router'
import { defaultLang, dirFor, type Lang } from './lang'

export const MAX_UPLOAD_MB = 8
export const STAFF_TIME_ZONE = 'Asia/Tehran'

const en = {
  brand: 'Inview',
  brandSub: 'for galleries',
  galleryName: 'O Gallery',
  staffNav: 'O Gallery staff',
  navEditor: 'Catalogue',
  navReport: 'Visits and leads',
  viewLive: 'Open the visitor page',
  signOut: 'Sign out',
  language: 'Language',

  signInPanelTitle: 'Edit the show. Keep the wall clear.',
  signInPanelBody: 'Open the O Gallery editor to update works, prices and the QR landing page.',
  signInTitle: 'O Gallery',
  accessCode: 'Gallery access code',
  signInHint: 'The server checks this code. Then it opens a staff session.',
  signInButton: 'Open the editor',
  wrongCode: 'That access code does not match.',
  tooMany: 'Too many attempts. Try again later.',

  pageTitle: 'O Gallery catalogue',
  pageEyebrow: 'O Gallery',

  reportTitle: 'Visits and leads',
  reportLoading: 'Loading visits and phone numbers…',
  reportFailed: 'The visit report did not load.',
  refresh: 'Refresh',
  scans: 'Landing scans',
  scansHint: 'One per browser per Tehran day',
  views: 'Work views',
  leadsTotal: 'Phone numbers',
  noVisits: 'There are no visits yet.',
  byDay: 'By day, Tehran time',
  day: 'Day',
  byWork: 'By work',
  work: 'Work',
  saves: 'Saves',
  asks: 'Questions',
  noWorkStats: 'No work has views or leads yet.',
  leadsTitle: 'Phone numbers',
  leadsNote: 'Each number is unverified. The 4-digit code is still a demo.',
  noLeads: 'No phone numbers yet.',
  downloadCsv: 'Download CSV',
  leadSave: 'Save',
  leadAsk: 'Question',
  noWork: 'No work',
  unverified: 'Unverified',
  consentVersion: 'Consent text',
  qrAddress: 'QR address',
  copy: 'Copy',
  copied: 'Copied',

  galleryTitle: 'Gallery',
  showTitleGroup: 'Show',
  name: 'Name',
  nameFa: 'Persian name',
  showTitle: 'Show title',
  showTitleFa: 'Show title in Persian',
  dates: 'Dates',
  datesFa: 'Dates in Persian',
  hours: 'Hours',
  hoursFa: 'Hours in Persian',
  address: 'Address',
  addressFa: 'Address in Persian',
  text: 'Exhibition text',
  textFa: 'Exhibition text in Persian',
  pdfUrl: 'PDF address',
  logo: 'Logo',
  removeLogo: 'Remove logo',

  worksTitle: 'Works',
  addSample: 'Add a labeled sample',
  addWork: 'Add a work',
  sampleRule: 'A sample must say “sample” or «نمونه» in the title. A sample is not an O Gallery artwork.',
  noWorks: 'No works yet. Add a work to build the catalogue.',
  workFallback: 'Work',
  artist: 'Artist',
  title: 'Title',
  titleFa: 'Title in Persian',
  artistFa: 'Artist in Persian',
  mediumFa: 'Medium in Persian',
  medium: 'Medium',
  size: 'Size',
  year: 'Year',
  price: 'Price in Toman',
  priceHint: 'Latin or Persian digits. Leave it empty to hide the price.',
  status: 'Status',
  available: 'Available',
  reserved: 'Reserved',
  sold: 'Sold',
  sampleCheck: 'Sample, not an O Gallery artwork',
  image: 'Image',
  removeWork: 'Remove work',
  sampleTitle: 'Sample work',

  chooseImage: 'Choose an image',
  replaceImage: 'Replace the image',
  removeImage: 'Remove the image',
  uploadHint: `PNG, JPEG or WebP, up to ${MAX_UPLOAD_MB} MB.`,
  uploading: 'Uploading',
  uploadType: 'Use a PNG, JPEG, or WebP image.',
  uploadSize: `Use an image smaller than ${MAX_UPLOAD_MB} MB.`,
  uploadFailed: 'The upload did not complete. Try again.',
  noImage: 'No image',

  publishTitle: 'Publish',
  publishNote: 'Publish uses your staff session. Visitors see the change at once.',
  publish: 'Publish',
  published: 'Published. The QR path is still /g/o-gallery.',
  publishFailed: 'Publish did not complete.',
  unsaved: 'You have changes that are not published.',
  allSaved: 'The visitor page shows this version.',

  preview: 'Preview',
  previewLanguage: 'Preview language',
}

export type StaffDict = typeof en

const fa: StaffDict = {
  brand: 'اینویو',
  brandSub: 'برای گالری‌ها',
  galleryName: 'گالری اُ',
  staffNav: 'کارکنان گالری اُ',
  navEditor: 'فهرست آثار',
  navReport: 'بازدیدها و شماره‌ها',
  viewLive: 'صفحه بازدیدکننده',
  signOut: 'خروج',
  language: 'زبان',

  signInPanelTitle: 'نمایشگاه را ویرایش کنید. دیوار را خلوت نگه دارید.',
  signInPanelBody: 'ویرایشگر گالری اُ را باز کنید تا آثار، قیمت‌ها و صفحه کد QR را به‌روز کنید.',
  signInTitle: 'گالری اُ',
  accessCode: 'کد دسترسی گالری',
  signInHint: 'سرور این کد را بررسی می‌کند و سپس جلسه کارکنان را باز می‌کند.',
  signInButton: 'باز کردن ویرایشگر',
  wrongCode: 'این کد دسترسی درست نیست.',
  tooMany: 'تلاش‌ها زیاد است. کمی بعد دوباره تلاش کنید.',

  pageTitle: 'فهرست آثار گالری اُ',
  pageEyebrow: 'گالری اُ',

  reportTitle: 'بازدیدها و شماره‌ها',
  reportLoading: 'در حال بارگیری بازدیدها و شماره‌ها…',
  reportFailed: 'گزارش بازدید بارگیری نشد.',
  refresh: 'به‌روزرسانی',
  scans: 'اسکن صفحه اصلی',
  scansHint: 'یکی برای هر مرورگر در هر روز به وقت تهران',
  views: 'بازدید آثار',
  leadsTotal: 'شماره‌ها',
  noVisits: 'هنوز بازدیدی ثبت نشده است.',
  byDay: 'روزانه، به وقت تهران',
  day: 'روز',
  byWork: 'به تفکیک اثر',
  work: 'اثر',
  saves: 'ذخیره',
  asks: 'پرسش',
  noWorkStats: 'هنوز هیچ اثری بازدید یا شماره ندارد.',
  leadsTitle: 'شماره‌ها',
  leadsNote: 'هیچ شماره‌ای تأیید نشده است. کد ۴ رقمی هنوز نمایشی است.',
  noLeads: 'هنوز شماره‌ای ثبت نشده است.',
  downloadCsv: 'دریافت CSV',
  leadSave: 'ذخیره',
  leadAsk: 'پرسش',
  noWork: 'بدون اثر',
  unverified: 'تأییدنشده',
  consentVersion: 'متن رضایت',
  qrAddress: 'نشانی QR',
  copy: 'کپی',
  copied: 'کپی شد',

  galleryTitle: 'گالری',
  showTitleGroup: 'نمایشگاه',
  name: 'نام انگلیسی',
  nameFa: 'نام فارسی',
  showTitle: 'عنوان انگلیسی نمایشگاه',
  showTitleFa: 'عنوان فارسی نمایشگاه',
  dates: 'تاریخ‌ها به انگلیسی',
  datesFa: 'تاریخ‌ها به فارسی',
  hours: 'ساعت‌ها به انگلیسی',
  hoursFa: 'ساعت‌ها به فارسی',
  address: 'نشانی به انگلیسی',
  addressFa: 'نشانی به فارسی',
  text: 'متن انگلیسی نمایشگاه',
  textFa: 'متن فارسی نمایشگاه',
  pdfUrl: 'نشانی PDF',
  logo: 'لوگو',
  removeLogo: 'حذف لوگو',

  worksTitle: 'آثار',
  addSample: 'افزودن نمونه برچسب‌دار',
  addWork: 'افزودن اثر',
  sampleRule: 'عنوان نمونه باید واژه «نمونه» یا sample را داشته باشد. نمونه اثر گالری اُ نیست.',
  noWorks: 'هنوز اثری نیست. برای ساختن فهرست، یک اثر اضافه کنید.',
  workFallback: 'اثر',
  artist: 'هنرمند',
  title: 'عنوان',
  titleFa: 'عنوان به فارسی',
  artistFa: 'هنرمند به فارسی',
  mediumFa: 'تکنیک به فارسی',
  medium: 'تکنیک',
  size: 'اندازه',
  year: 'سال',
  price: 'قیمت به تومان',
  priceHint: 'رقم فارسی یا لاتین. برای پنهان کردن قیمت، خالی بگذارید.',
  status: 'وضعیت',
  available: 'موجود',
  reserved: 'رزروشده',
  sold: 'فروخته‌شده',
  sampleCheck: 'نمونه، اثر گالری اُ نیست',
  image: 'تصویر',
  removeWork: 'حذف اثر',
  sampleTitle: 'اثر نمونه',

  chooseImage: 'انتخاب تصویر',
  replaceImage: 'تعویض تصویر',
  removeImage: 'حذف تصویر',
  uploadHint: `PNG، JPEG یا WebP، تا ${MAX_UPLOAD_MB.toLocaleString('fa-IR')} مگابایت.`,
  uploading: 'در حال بارگذاری',
  uploadType: 'یک تصویر PNG، JPEG یا WebP انتخاب کنید.',
  uploadSize: `تصویری کوچک‌تر از ${MAX_UPLOAD_MB.toLocaleString('fa-IR')} مگابایت انتخاب کنید.`,
  uploadFailed: 'بارگذاری انجام نشد. دوباره تلاش کنید.',
  noImage: 'بدون تصویر',

  publishTitle: 'انتشار',
  publishNote: 'انتشار با جلسه کارکنان شما انجام می‌شود. بازدیدکنندگان تغییر را فوراً می‌بینند.',
  publish: 'انتشار',
  published: 'منتشر شد. مسیر QR همچنان /g/o-gallery است.',
  publishFailed: 'انتشار انجام نشد.',
  unsaved: 'تغییراتی دارید که هنوز منتشر نشده است.',
  allSaved: 'صفحه بازدیدکننده همین نسخه را نشان می‌دهد.',

  preview: 'پیش‌نمایش',
  previewLanguage: 'زبان پیش‌نمایش',
}

export const staffDictionaries: Record<Lang, StaffDict> = { en, fa }

function locale(lang: Lang) {
  return lang === 'fa' ? 'fa-IR' : 'en-GB'
}

export function staffFormat(lang: Lang) {
  const number = new Intl.NumberFormat(locale(lang))
  const calendar = lang === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB'
  const dateTime = new Intl.DateTimeFormat(calendar, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: STAFF_TIME_ZONE,
  })
  const dayOnly = new Intl.DateTimeFormat(calendar, { dateStyle: 'medium', timeZone: 'UTC' })
  return {
    number: (value: number) => number.format(value),
    dateTime: (iso: string) => dateTime.format(new Date(iso)),
    day: (isoDay: string) => dayOnly.format(new Date(`${isoDay}T12:00:00Z`)),
  }
}

export function staffT(lang: Lang) {
  return { t: staffDictionaries[lang], lang, dir: dirFor(lang), format: staffFormat(lang) }
}

export function useStaffT() {
  const root = useRouteLoaderData('root') as { lang?: Lang } | undefined
  const { pathname } = useLocation()
  return staffT(root?.lang ?? defaultLang(pathname))
}
