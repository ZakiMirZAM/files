import { Link } from "react-router-dom";
import { LegalLayout } from "../components/LegalLayout";

export function TermsPage() {
  return (
    <LegalLayout
      title="Terms of service"
      updated="14 July 2026"
      lede="IntrinsicFinEd is a free educational tool for learning how to value a company. It is not a broker, not an adviser, and not a source of recommendations. Using the site means you accept the terms below."
    >
      <h2>1. Who we are, and what you are agreeing to</h2>
      <p>
        IntrinsicFinEd (also written IntrinsicEd) is a website at intrinsicfined.org, run by Zaki Mir from Houston,
        Texas. These terms are a contract between you and him. If you create an account, sign in, or browse the
        analysis pages, you accept them. If a clause here is unacceptable to you, do not use the site.
      </p>
      <p>
        Read the <Link to="/privacy">privacy policy</Link> too. It explains what the site stores about you, and it is
        part of this agreement.
      </p>

      <h2>2. The service is educational. It is not financial advice.</h2>
      <p>
        This is the most important term on the page, so it is not buried at the bottom.
      </p>
      <div className="callout">
        <p>
          <strong>Nothing on IntrinsicFinEd is investment advice, a recommendation, or a solicitation to buy or sell
          any security.</strong> The valuations, scores, verdicts, rankings and written explanations are teaching
          material produced by software. They are not tailored to you, your finances, or your goals. No adviser
          relationship and no fiduciary duty is created by your use of this site. Before you risk money, do your own
          work, and consider talking to a licensed professional who knows your situation.
        </p>
      </div>
      <p>
        A discounted cash flow model is an argument, not a fact. Change the growth rate or the discount rate and the
        answer changes with it. Treat every number the site produces as the start of your own thinking rather than the
        end of it.
      </p>

      <h2>3. Who may use the site</h2>
      <ul>
        <li>You must be at least 13 years old. The site is not directed at children under 13 and we do not knowingly
          create accounts for them.</li>
        <li>If you are under 18, you may use the site only with the involvement of a parent or guardian who agrees to
          these terms on your behalf.</li>
        <li>You must have the legal capacity to enter a contract where you live, and you must not be barred from using
          the service under the laws that apply to you.</li>
      </ul>

      <h2>4. Your account</h2>
      <p>
        You can sign up with an email address and a password, or start an anonymous session. Keep your password to
        yourself. You are responsible for what happens under your account, so tell us at{" "}
        <a href="mailto:contact@intrinsicfined.org">contact@intrinsicfined.org</a> if you think someone else is using
        it.
      </p>
      <p>
        Anonymous sessions are convenient but fragile. The work saved in one is tied to that session, and if you lose
        it, we have no way to identify you and restore it.
      </p>

      <h2>5. What you write stays yours</h2>
      <p>
        Your answers to the analysis questions, your notes, your watchlist, your investment policy statement and your
        simulator trades belong to you. We claim no ownership of them. You give us only the narrow permission needed to
        run the service: to store your work, show it back to you, and send the relevant figures to the AI explanation
        service when you press a button that asks for an explanation.
      </p>
      <p>
        We do not sell your content, and we do not use it to advertise to you. Section 7 explains what does leave the
        site.
      </p>

      <h2>6. Acceptable use</h2>
      <p>Do not do any of the following:</p>
      <ul>
        <li>Break into accounts, servers, or data that are not yours, or try to.</li>
        <li>Hammer the API with automated traffic, evade the rate limits, or otherwise degrade the service for other
          people. The backend runs on one machine, and a scraper that ignores this takes the site down for everyone.</li>
        <li>Upload anything unlawful, or anything that infringes someone else's rights.</li>
        <li>Present the site's output as personalised financial advice to other people, or resell it as a signal
          service.</li>
        <li>Strip out the disclaimers when you quote or republish what the site produces.</li>
      </ul>

      <h2>7. AI explanations</h2>
      <p>
        When you press "Explain using AI", the question and the figures already on the page are sent to a language
        model to produce an explanation. That request leaves our servers and reaches a third party. Two consequences
        follow, and both matter.
      </p>
      <ul>
        <li><strong>The output can be wrong.</strong> Language models state incorrect things fluently. Check anything
          that would change a decision against the underlying filings.</li>
        <li><strong>Do not type secrets into it.</strong> Account numbers, passwords, or anything you would not want
          leaving your machine do not belong in an answer box.</li>
      </ul>

      <h2>8. The simulator uses no real money</h2>
      <p>
        The paper trading simulator is a teaching device. The cash is imaginary, the trades are never routed to a
        market, and the results prove nothing about how you would perform with real money at risk. Prices shown in it
        may be delayed or wrong.
      </p>

      <h2>9. The data may be wrong</h2>
      <p>
        Financial figures come from public sources including SEC filings, the Federal Reserve Bank of St. Louis, and
        market data vendors. Those sources contain errors, revise their history, and go down. Numbers can be stale,
        misaligned to the wrong fiscal year, or missing entirely. The service is provided <strong>as is</strong> and{" "}
        <strong>as available</strong>, with no warranty of accuracy, completeness, merchantability, or fitness for any
        purpose. When live data is unavailable the site tells you so rather than inventing a figure, but that safeguard
        is not a guarantee of correctness.
      </p>

      <h2>10. Availability</h2>
      <p>
        The site is free, and it is self-hosted rather than run on a fleet of servers. It goes down. Features change,
        and some disappear. We may suspend or stop the service at any time, and we do not owe you compensation for
        downtime.
      </p>

      <h2>11. Limitation of liability</h2>
      <p>
        To the fullest extent the law allows, IntrinsicFinEd and its operator are not liable for any investment loss,
        lost profit, lost data, or indirect or consequential damage arising from your use of the site. If a court finds
        us liable anyway, total liability is capped at the greater of the amount you paid us in the previous twelve
        months, which for a free service is nothing, and one hundred United States dollars.
      </p>
      <p>
        Some jurisdictions do not allow the exclusion of certain warranties or liabilities. Where that is true, the
        limits above apply only as far as your law permits, and your statutory consumer rights are untouched by
        anything on this page.
      </p>

      <h2>12. Termination</h2>
      <p>
        You can stop using the site whenever you like, and you can ask us to delete your account and everything in it
        by emailing <a href="mailto:contact@intrinsicfined.org">contact@intrinsicfined.org</a>. We may suspend an
        account that is attacking the service or breaking section 6. If we terminate your account for a reason other
        than abuse, we will make a reasonable effort to let you export your work first.
      </p>

      <h2>13. Changes to these terms</h2>
      <p>
        We can change these terms. When we do, the date at the top of this page changes, and material changes will be
        announced on the site before they take effect. Continuing to use the site after a change means you accept the
        new version. We keep the previous versions and will send you one on request, so you can see exactly what
        changed.
      </p>

      <h2>14. Governing law and disputes</h2>
      <p>
        These terms are governed by the laws of the State of Texas, United States, without regard to conflict of law
        rules. Disputes go to the state or federal courts in Harris County, Texas.
      </p>
      <p>
        We do not force you into arbitration, we do not make you waive a class action, and we do not shorten the time
        limit the law gives you to bring a claim. If you are a consumer in a country whose law grants you the right to
        sue where you live, that right survives this section. Small claims court remains open to both of us.
      </p>

      <h2>15. The rest</h2>
      <ul>
        <li>If one clause here turns out to be unenforceable, the others still stand.</li>
        <li>Not enforcing a term once does not mean we have given it up.</li>
        <li>These terms, plus the privacy policy, are the whole agreement between us about the site.</li>
        <li>You cannot transfer your rights under this agreement. We may transfer ours if the site changes hands, and
          we will tell you on the site before that happens.</li>
      </ul>

      <h2>16. Contact</h2>
      <p>
        Write to <a href="mailto:contact@intrinsicfined.org">contact@intrinsicfined.org</a> with any question about
        these terms.
      </p>
    </LegalLayout>
  );
}
