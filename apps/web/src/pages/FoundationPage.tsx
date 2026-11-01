/*
 * impeccable:direction c8842e84-7
 * THESIS: International standards, local understanding — a calm, confident property-management landing page. Refuses the hero-metric + icon-card template.
 * OWN-WORLD: Neutral paper ground (#f7f6f2), Manrope display + DM Sans body, committed warm orange (#ff5a1f), strict grid, photographic property imagery. No cards, no eyebrow kickers, no section numbers.
 * STORY: A property owner understands what Silverstone does, trusts the operation, and either signs in or starts onboarding.
 * FIRST VIEWPORT: Full-bleed property photography with a warm shade, display headline, supporting line, and two actions — Sign in and Onboard.
 * FORM: Candidate 7 of own grounded list (Swiss international corporate identity), seed key c8842e84.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
 */

import {
  ArrowRight,
  Building2,
  Landmark,
  Lock,
  Menu,
  MoveUpRight,
  ShieldCheck,
  Store,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

const partners = [
  'Estate associations',
  'Property developers',
  'Facility partners',
  'Resident communities',
];

const confidence = [
  {
    title: 'Verified access',
    detail: 'Every sign-in is authenticated, with role-based permissions and a clear audit trail.',
    icon: ShieldCheck,
  },
  {
    title: 'Private records',
    detail: 'Resident documents and personal data stay protected and access-controlled.',
    icon: Lock,
  },
  {
    title: 'Clear reporting',
    detail: 'Transparent records for payments, assignments and day-to-day facility operations.',
    icon: Building2,
  },
];

const builtFor = [
  {
    title: 'Residential communities',
    detail: 'Estates · Apartments · Homes',
    icon: Building2,
  },
  {
    title: 'Commercial properties',
    detail: 'Offices · Retail · Mixed-use',
    icon: Store,
  },
  {
    title: 'Organisations & associations',
    detail: 'Businesses · Co-operatives · Institutions',
    icon: Landmark,
  },
];

export function FoundationPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="sm-landing">
      <header className="sm-header">
        <a className="sm-wordmark" href="#top" aria-label="Silverstone Managers home">
          <img
            className="sm-logo"
            src="/images/foundation/silverstone-logo.png"
            alt=""
            width={652}
            height={222}
          />
        </a>

        <button
          className="sm-menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden size={20} /> : <Menu aria-hidden size={20} />}
        </button>

        <nav className={`sm-nav${menuOpen ? ' is-open' : ''}`} aria-label="Main navigation">
          <a href="#partners" onClick={() => setMenuOpen(false)}>
            Partners
          </a>
          <a href="#confidence" onClick={() => setMenuOpen(false)}>
            How we work
          </a>
          <a href="#built-for" onClick={() => setMenuOpen(false)}>
            Who we serve
          </a>
          <a href="#contact" onClick={() => setMenuOpen(false)}>
            Contact
          </a>
          <Link to="/onboard" onClick={() => setMenuOpen(false)}>
            Onboard
          </Link>
          <Link className="sm-nav-signin" to="/login" onClick={() => setMenuOpen(false)}>
            Sign in <MoveUpRight aria-hidden size={14} />
          </Link>
        </nav>
      </header>

      <main id="top">
        <section className="sm-hero" aria-labelledby="hero-title">
          <div
            className="sm-hero-image"
            role="img"
            aria-label="A contemporary property interior in natural light"
          />
          <div className="sm-hero-shade" />
          <div className="sm-hero-content">
            <h1 id="hero-title">
              Better managed.
              <br />
              <em>Better for life.</em>
            </h1>
            <p>
              International standards and local insight, brought together to care for the places
              people live, work and grow.
            </p>
            <div className="sm-hero-actions">
              <Link to="/login" className="sm-button sm-button-commit">
                Sign in <ArrowRight aria-hidden size={16} />
              </Link>
              <Link to="/onboard" className="sm-button sm-button-quiet">
                Onboard <ArrowRight aria-hidden size={16} />
              </Link>
            </div>
          </div>
          <div className="sm-hero-caption">
            <span className="sm-caption-rule" />
            <span>LAGOS, NIGERIA</span>
          </div>
        </section>

        <section className="sm-partners" id="partners" aria-labelledby="partners-title">
          <h2 id="partners-title" className="sm-partners-label">
            Who we work with
          </h2>
          <ul className="sm-partner-list">
            {partners.map((partner) => (
              <li key={partner}>{partner}</li>
            ))}
          </ul>
        </section>

        <section className="sm-confidence" id="confidence" aria-labelledby="confidence-title">
          <div className="sm-section-heading">
            <h2 id="confidence-title">
              Details in <em>confidence.</em>
            </h2>
            <p>
              Good management is built on quiet reliability. The records, access and reporting that
              keep a property running are handled carefully, so nothing is left to chance.
            </p>
          </div>
          <div className="sm-confidence-list">
            {confidence.map(({ title, detail, icon: Icon }) => (
              <article className="sm-confidence-item" key={title}>
                <Icon aria-hidden size={22} strokeWidth={1.5} />
                <h3>{title}</h3>
                <p>{detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="sm-built" id="built-for" aria-labelledby="built-title">
          <div className="sm-built-heading">
            <h2 id="built-title">
              Built for the way <em>you live and work.</em>
            </h2>
            <p>Different places. Different needs. One thoughtful standard of care.</p>
          </div>
          <div className="sm-built-list">
            {builtFor.map(({ title, detail, icon: Icon }) => (
              <article className="sm-built-item" key={title}>
                <Icon aria-hidden size={22} strokeWidth={1.5} />
                <h3>{title}</h3>
                <p>{detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="sm-cta" id="contact" aria-labelledby="cta-title">
          <div className="sm-cta-content">
            <h2 id="cta-title">
              Ready when <em>you are.</em>
            </h2>
            <p>
              Sign in to your account, or start onboarding and tell us about the property you're
              looking after.
            </p>
            <div className="sm-cta-actions">
              <Link to="/login" className="sm-button sm-button-dark">
                Sign in <ArrowRight aria-hidden size={16} />
              </Link>
              <Link to="/onboard" className="sm-button sm-button-quiet-dark">
                Onboard a property <ArrowRight aria-hidden size={16} />
              </Link>
            </div>
          </div>
          <div className="sm-cta-contact">
            <span className="sm-cta-contact-label">Talk to a person</span>
            <a href="mailto:info@silverstonemanagers.com">info@silverstonemanagers.com</a>
            <a href="tel:+2348127396530">+234 812 739 6530</a>
            <span>Lagos, Nigeria</span>
          </div>
        </section>
      </main>

      <footer className="sm-footer">
        <a
          className="sm-wordmark sm-wordmark-footer"
          href="#top"
          aria-label="Silverstone Managers home"
        >
          <img
            className="sm-logo"
            src="/images/foundation/silverstone-logo.png"
            alt=""
            width={652}
            height={222}
          />
        </a>
        <p>Better managed places. Stronger communities. Lasting value.</p>
        <div className="sm-footer-links">
          <a href="https://silverstonemanagers.com/" target="_blank" rel="noreferrer">
            Company website <MoveUpRight aria-hidden size={13} />
          </a>
          <Link to="/login">Sign in</Link>
        </div>
        <span className="sm-copyright">© {new Date().getFullYear()} Silverstone Managers</span>
      </footer>
    </div>
  );
}
