import { useLocation, useRouteLoaderData } from 'react-router'
import { defaultLang, dirFor, type Lang } from './lang'
import { staffFormat } from './i18n-staff'

const en = {
  brand: 'Inview', panel: 'Operator panel', overview: 'Galleries', newGallery: 'Create a gallery',
  signIn: 'Sign in', signOut: 'Sign out', identifier: 'Email or phone', password: 'Password', name: 'Name',
  accept: 'Accept invite', invitation: 'Your invitation', invalidInvite: 'This invite is not valid or has expired.',
  passwordHint: 'Use at least 10 characters.', error: 'The request failed. Check your details and try again.',
  limited: 'Too many attempts. Try again later.', forbidden: 'This account does not have operator access.',
  slug: 'Gallery address', nameFa: 'Persian name', nameEn: 'English name', showTitle: 'First show title',
  ownerIdentifier: 'Owner email or phone', status: 'Status', draft: 'Draft', live: 'Live', paused: 'Paused',
  notes: 'Private notes', sharedCode: 'Allow shared code sign-in', rotate: 'Make a new shared code',
  save: 'Save changes', saved: 'Saved.', profile: 'Gallery profile', team: 'Team', visitor: 'Visitor page', editor: 'Staff area',
  once: 'Shown once. Copy this before leaving the page.', inviteLink: 'Invite link', code: 'New shared code',
  copy: 'Copy', copied: 'Copied', copyFailed: 'Select the value and copy it.', works: 'Works', lastPublish: 'Last publish',
  days7: '7 days', days30: '30 days', scans: 'Scans', views: 'Views', leads: 'Leads',
  recent: 'Recent activity', action: 'Action', time: 'Time', noRows: 'Nothing here yet.',
  health: 'Service readiness', ready: 'Ready', down: 'Needs attention',
  role: 'Role', owner: 'Owner', editorRole: 'Editor', viewer: 'Viewer', admin: 'Admin', support: 'Support',
  active: 'Active', disabled: 'Disabled', invited: 'Invited', lastSignIn: 'Last sign-in', invite: 'Invite staff',
  changeRole: 'Change role', disable: 'Disable', enable: 'Enable', remove: 'Remove membership', reset: 'Make a reset link',
  signOutUser: 'Sign out all sessions', staff: 'Gallery staff', operator: 'Operator', resetKind: 'Password reset',
  never: 'None yet', back: 'Back to galleries', gallery: 'Gallery', actions: 'Actions',
  invalidFields: 'Check the fields. The slug or account may already be in use.',
  teamError: 'Check the account details. Existing accounts cannot receive staff invites. Shared accounts cannot be disabled or reset here.',
  'gallery-create': 'Gallery created', 'gallery-update': 'Gallery updated', 'gallery-code-rotate': 'Shared code changed',
  'invite-create': 'Invite created', 'invite-accept': 'Invite accepted', 'team-role': 'Staff role changed',
  'team-disable': 'Staff disabled', 'team-enable': 'Staff enabled', 'team-remove': 'Membership removed',
  'team-reset': 'Reset link created', 'team-sign-out': 'Staff signed out', 'sign-out-all': 'Sessions signed out',
}

const fa: typeof en = {
  brand: 'اینویو', panel: 'پنل اپراتور', overview: 'گالری‌ها', newGallery: 'ساخت گالری',
  signIn: 'ورود', signOut: 'خروج', identifier: 'ایمیل یا شماره تلفن', password: 'رمز عبور', name: 'نام',
  accept: 'پذیرش دعوت', invitation: 'دعوت شما', invalidInvite: 'این دعوت معتبر نیست یا منقضی شده است.',
  passwordHint: 'حداقل ۱۰ نویسه وارد کنید.', error: 'درخواست انجام نشد. اطلاعات را بررسی کنید و دوباره تلاش کنید.',
  limited: 'تلاش‌ها زیاد است. کمی بعد دوباره تلاش کنید.', forbidden: 'این حساب دسترسی اپراتور ندارد.',
  slug: 'نشانی گالری', nameFa: 'نام فارسی', nameEn: 'نام انگلیسی', showTitle: 'عنوان اولین نمایشگاه',
  ownerIdentifier: 'ایمیل یا تلفن مالک', status: 'وضعیت', draft: 'پیش‌نویس', live: 'فعال', paused: 'متوقف',
  notes: 'یادداشت خصوصی', sharedCode: 'ورود با کد مشترک مجاز باشد', rotate: 'ساخت کد مشترک جدید',
  save: 'ذخیره تغییرات', saved: 'ذخیره شد.', profile: 'مشخصات گالری', team: 'تیم', visitor: 'صفحه بازدیدکننده', editor: 'بخش کارکنان',
  once: 'فقط یک بار نمایش داده می‌شود. پیش از خروج کپی کنید.', inviteLink: 'پیوند دعوت', code: 'کد مشترک جدید',
  copy: 'کپی', copied: 'کپی شد', copyFailed: 'مقدار را انتخاب و کپی کنید.', works: 'آثار', lastPublish: 'آخرین انتشار',
  days7: '۷ روز', days30: '۳۰ روز', scans: 'اسکن‌ها', views: 'بازدیدها', leads: 'درخواست‌ها',
  recent: 'فعالیت‌های اخیر', action: 'عملیات', time: 'زمان', noRows: 'هنوز موردی نیست.',
  health: 'آمادگی سرویس', ready: 'آماده', down: 'نیاز به بررسی',
  role: 'نقش', owner: 'مالک', editorRole: 'ویرایشگر', viewer: 'بیننده', admin: 'مدیر', support: 'پشتیبان',
  active: 'فعال', disabled: 'غیرفعال', invited: 'دعوت‌شده', lastSignIn: 'آخرین ورود', invite: 'دعوت همکار',
  changeRole: 'تغییر نقش', disable: 'غیرفعال کردن', enable: 'فعال کردن', remove: 'حذف عضویت', reset: 'ساخت پیوند بازیابی',
  signOutUser: 'خروج از همه نشست‌ها', staff: 'کارکنان گالری', operator: 'اپراتور', resetKind: 'بازیابی رمز عبور',
  never: 'هنوز ثبت نشده', back: 'بازگشت به گالری‌ها', gallery: 'گالری', actions: 'عملیات',
  invalidFields: 'ورودی‌ها را بررسی کنید. شاید نشانی یا حساب از قبل وجود دارد.',
  teamError: 'اطلاعات حساب را بررسی کنید. حساب موجود دعوت جدید نمی‌گیرد. حساب چندگالری را نمی‌توان اینجا غیرفعال یا بازیابی کرد.',
  'gallery-create': 'گالری ساخته شد', 'gallery-update': 'گالری به‌روز شد', 'gallery-code-rotate': 'کد مشترک تغییر کرد',
  'invite-create': 'دعوت ساخته شد', 'invite-accept': 'دعوت پذیرفته شد', 'team-role': 'نقش همکار تغییر کرد',
  'team-disable': 'همکار غیرفعال شد', 'team-enable': 'همکار فعال شد', 'team-remove': 'عضویت حذف شد',
  'team-reset': 'پیوند بازیابی ساخته شد', 'team-sign-out': 'همکار خارج شد', 'sign-out-all': 'نشست‌ها بسته شدند',
}

export const opsDictionaries = { en, fa }

export function useOpsT() {
  const root = useRouteLoaderData('root') as { lang?: Lang } | undefined
  const { pathname } = useLocation()
  const lang = root?.lang ?? defaultLang(pathname)
  return { t: opsDictionaries[lang], lang, dir: dirFor(lang), format: staffFormat(lang) }
}
