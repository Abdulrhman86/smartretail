import { Link } from 'react-router-dom';

const footerLinks = [
  {
    title: 'Shop',
    links: [
      { label: 'New Arrivals', to: '/products?sort=newest' },
      { label: 'Apparel', to: '/products?category=apparel' },
      { label: 'Footwear', to: '/products?category=footwear' },
      { label: 'Accessories', to: '/products?category=accessories' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'My Account', to: '/account' },
      { label: 'Order Status', to: '/account/orders' },
      { label: 'Shopping Bag', to: '/cart' },
      { label: 'Sign In', to: '/login' },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'Shipping & Returns', to: '/help#shipping' },
      { label: 'FAQ', to: '/help#faq' },
      { label: 'Contact Us', to: '/help#contact' },
      { label: 'About SmartRetail', to: '/help#about' },
    ],
  },
];

export default function SiteFooter({ className = 'mt-20' }) {
  return (
    <footer className={`border-t border-border bg-foreground py-16 text-background sm:py-20 ${className}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link to="/" className="font-display text-2xl font-semibold tracking-tight">
              SmartRetail
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-background/70">
              Premium essentials for everyday living. Designed with intention, made with care.
            </p>
          </div>
          {footerLinks.map((group) => (
            <div key={group.title}>
              <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-background/50">{group.title}</h4>
              <ul className="mt-5 space-y-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to} className="text-sm text-background/80 transition-colors hover:text-background">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-background/10 pt-8 sm:flex-row">
          <p className="text-xs text-background/50">© {new Date().getFullYear()} SmartRetail. A portfolio demo store — no real payments are processed.</p>
          <div className="flex gap-6">
            <Link to="/help#privacy" className="text-xs text-background/50 transition-colors hover:text-background">
              Privacy Policy
            </Link>
            <Link to="/help#terms" className="text-xs text-background/50 transition-colors hover:text-background">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
