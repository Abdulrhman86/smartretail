import { Link } from 'react-router-dom';
import useDocumentTitle from '../hooks/useDocumentTitle';

const FAQ = [
  {
    q: 'Is this a real store?',
    a: 'No. SmartRetail is a full-stack portfolio project. Products, prices and orders are demo data, and no payment is ever taken.',
  },
  {
    q: 'How much is shipping?',
    a: 'Standard shipping (3–5 business days) is free on orders over KD 15.000 and KD 1.750 otherwise. Express delivery (next business day) is KD 4.500.',
  },
  {
    q: 'Can I cancel an order?',
    a: 'Yes — while an order is still pending you can cancel it from Account → Orders. Stock is released immediately.',
  },
  {
    q: 'Do you have discount codes?',
    a: 'Try WELCOME10 for 10% off your order. Codes are validated at checkout and the discount is shown before you place the order.',
  },
  {
    q: 'Do I need an account to shop?',
    a: 'You can browse without one. Adding to your bag and checking out require signing in so your cart and orders are saved to your account.',
  },
];

function Section({ id, eyebrow, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border py-12 first:border-t-0 first:pt-0">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
      <h2 className="mt-1 font-display text-3xl font-normal tracking-tight text-foreground">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{children}</div>
    </section>
  );
}

export default function HelpPage() {
  useDocumentTitle('Help & Information');
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-24 sm:px-6 sm:pt-28 lg:px-8">
      <div className="mb-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Customer Care</p>
        <h1 className="mt-1 font-display text-4xl font-normal tracking-tight text-foreground sm:text-5xl">Help &amp; Information</h1>
        <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {[
            ['shipping', 'Shipping & Returns'],
            ['faq', 'FAQ'],
            ['contact', 'Contact'],
            ['about', 'About'],
            ['privacy', 'Privacy'],
            ['terms', 'Terms'],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              {label}
            </a>
          ))}
        </nav>
      </div>

      <Section id="shipping" eyebrow="Delivery" title="Shipping & Returns">
        <p>Standard delivery takes 3–5 business days and is complimentary on orders over KD 15.000 (KD 1.750 below that). Express delivery arrives the next business day for KD 4.500.</p>
        <p>Unworn items can be returned within 30 days of delivery. Since this is a demo store, returns are illustrative only.</p>
      </Section>

      <Section id="faq" eyebrow="Questions" title="Frequently Asked">
        <dl className="divide-y divide-border">
          {FAQ.map((item) => (
            <div key={item.q} className="py-4 first:pt-0">
              <dt className="font-medium text-foreground">{item.q}</dt>
              <dd className="mt-1">{item.a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="contact" eyebrow="Get in touch" title="Contact Us">
        <p>
          SmartRetail doesn&apos;t have a support team — it&apos;s a portfolio piece. For questions about the project itself, reach out to its author through the
          repository linked in the README.
        </p>
      </Section>

      <Section id="about" eyebrow="The project" title="About SmartRetail">
        <p>
          SmartRetail is a full-stack e-commerce demo built with React, FastAPI and Supabase (Postgres + Auth), featuring a real catalog, cart, checkout, order
          management and an admin dashboard. An AI shopping assistant is planned next.
        </p>
        <p>
          <Link to="/products" className="font-medium text-foreground underline underline-offset-4">Browse the catalog</Link>
        </p>
      </Section>

      <Section id="privacy" eyebrow="Legal" title="Privacy Policy">
        <p>
          We store the minimum needed to run the demo: your email and optional name (via Supabase Auth), your cart, orders, reviews and the shipping details you
          enter at checkout. Data isn&apos;t sold or shared. Use a test address — don&apos;t enter real personal information you wouldn&apos;t want in a demo database.
        </p>
      </Section>

      <Section id="terms" eyebrow="Legal" title="Terms of Service">
        <p>
          This site is provided as-is for demonstration purposes. Orders are not fulfilled, no goods are shipped, and no payments are processed. Accounts and data
          may be reset at any time.
        </p>
      </Section>
    </main>
  );
}
