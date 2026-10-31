type P = { size?: number; filled?: boolean }
const base = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
})

export const Heart = ({ size = 20, filled }: P) => (
  <svg {...base(size)} fill={filled ? 'currentColor' : 'none'}><path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 0 1 12 6a5 5 0 0 1 7.5 6.6z" /></svg>
)
export const Chevron = ({ size = 18 }: P) => (<svg {...base(size)} className="flip-rtl"><path d="M9 6l6 6-6 6" /></svg>)
export const Back = ({ size = 18 }: P) => (<svg {...base(size)} className="flip-rtl"><path d="M15 6l-6 6 6 6" /></svg>)
export const Lock = ({ size = 18 }: P) => (<svg {...base(size)}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>)
export const Calendar = ({ size = 20 }: P) => (<svg {...base(size)}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>)
export const Check = ({ size = 18 }: P) => (<svg {...base(size)}><circle cx="12" cy="12" r="8" /><path d="M8.5 12.5l2.3 2.3 4.7-5" /></svg>)
export const Chat = ({ size = 18 }: P) => (<svg {...base(size)}><path d="M5 18l-1 3 3.5-1.5A8 8 0 1 0 5 18z" /></svg>)
export const User = ({ size = 20 }: P) => (<svg {...base(size)}><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></svg>)
export const Grid = ({ size = 20 }: P) => (<svg {...base(size)}><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></svg>)
export const Home = ({ size = 20 }: P) => (<svg {...base(size)}><path d="M4 11l8-7 8 7v9H4z" /><path d="M10 20v-5h4v5" /></svg>)
