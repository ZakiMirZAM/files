import { Link } from "react-router-dom";
import { LegalLayout } from "../components/LegalLayout";

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy policy"
      updated="14 July 2026"
      lede="Short version: we store your email and the work you do on the site. There are no ads, no trackers, and no analytics. We have never sold your data and we do not intend to start."
    >
      <h2>1. Who is responsible for your data</h2>
      <p>
        IntrinsicFinEd is run by Zaki Mir in Houston, Texas. He is the data controller for everything described here.
        Reach him at <a href="mailto:contact@intrinsicfined.org">contact@intrinsicfined.org</a>. This policy covers the
        website at intrinsicfined.org and the services behind it, and it works alongside the{" "}
        <Link to="/terms">terms of service</Link>.
      </p>

      <h2>2. What we collect</h2>

      <h3>Account information</h3>
      <p>
        If you sign up, we store your email address and a cryptographic hash of your password. We never see or store
        the password itself. You can also use the site through an anonymous session, which creates an account with no
        email attached to it.
      </p>

      <h3>The work you do on the site</h3>
      <p>
        This is the bulk of what we hold, and all of it is written by you:
      </p>
      <ul>
        <li>Your written answers to the analysis questions at each stage.</li>
        <li>Notes you keep in the notebook, including anything you paste into them.</li>
        <li>Your watchlist and the companies you look at.</li>
        <li>Your investment policy statement, which includes your stated objectives, risk tolerance, time horizon,
          liquidity needs, tax notes and constraints. This is financial information about you, so treat that box with
          the care it deserves.</li>
        <li>Your paper trading portfolio, positions and trade history in the simulator.</li>
        <li>AI explanations generated for you, cached so that reopening one does not re-run the request.</li>
      </ul>

      <h3>Technical information</h3>
      <p>
        Our servers and our network provider log the ordinary things a web server logs: your IP address, the time of
        the request, the page or endpoint you asked for, and your browser's user agent. We use these to keep the site
        up, to apply rate limits, and to investigate abuse. They are not used to build a profile of you.
      </p>

      <h3>Storage on your own device</h3>
      <p>
        The site keeps a sign-in token and a few interface preferences in your browser's local storage. Preferences
        include whether the sidebar is collapsed, which product tour you have finished, and the weights you set on the
        sector rotation page. These stay on your device. They are not tracking cookies, and no advertising network can
        read them.
      </p>

      <h2>3. What we do not collect</h2>
      <ul>
        <li>No advertising or third-party marketing cookies.</li>
        <li>No analytics package. No Google Analytics, no pixels, no session recording.</li>
        <li>No payment details. The site is free and takes no money, so there is nothing to store.</li>
        <li>No brokerage credentials, no account numbers, no linked bank accounts. The simulator is paper only, and it
          never touches a real broker.</li>
        <li>No purchase of data about you from anyone else.</li>
      </ul>

      <h2>4. Why we hold it, and on what legal basis</h2>
      <p>
        Your account and your saved work exist so the site can do the one thing you came for, which is to carry your
        analysis from one visit to the next. Under the GDPR this is processing necessary to perform our contract with
        you. Server logs and rate limiting rest on our legitimate interest in keeping the service available and
        secure. We do not rely on consent for anything except optional features you switch on yourself, and where we
        do, you can withdraw it.
      </p>

      <h2>5. Who else sees it</h2>
      <p>
        We use a small number of providers to run the site. Each one gets only what it needs.
      </p>
      <ul>
        <li><strong>Convex</strong> stores your account and everything you write. Your data lives on their
          infrastructure in the United States.</li>
        <li><strong>Cloudflare</strong> serves the website and carries traffic to the analysis backend. It processes
          IP addresses and request metadata in transit.</li>
        <li><strong>Anthropic</strong> receives the text of your question and the figures on the page when you ask for
          an AI explanation, and returns the explanation. Do not type anything into an answer box that you would not
          want to leave your machine.</li>
        <li>An <strong>AI explanation may run a web search</strong> to check a fact. When it does, the search terms go
          to a search provider.</li>
      </ul>
      <p>
        Public data sources including SEC EDGAR, the Federal Reserve Bank of St. Louis, and market data vendors receive
        no information about you. The site fetches company and economic figures from them on its own behalf, not
        yours.
      </p>
      <p>
        We will also disclose data if a valid legal order compels us to. Where the law allows it, you will be told
        first.
      </p>

      <h2>6. We do not sell your data</h2>
      <p>
        We do not sell personal information, and we do not share it for cross-context behavioural advertising, in the
        sense the California Consumer Privacy Act gives those words. There is no "do not sell my data" button because
        there is nothing to opt out of.
      </p>

      <h2>7. How long we keep it</h2>
      <p>
        Your account and your work stay until you delete them. Delete an item in the app and it goes from the live
        database immediately. Ask us to delete your account and we will remove it and its contents within 30 days,
        backups included, unless the law requires us to keep something. Server logs are kept for a short operational
        period and then discarded.
      </p>

      <h2>8. Your rights</h2>
      <p>
        Wherever you live, we will honour these. Email{" "}
        <a href="mailto:contact@intrinsicfined.org">contact@intrinsicfined.org</a> and we will answer within 30 days,
        free of charge.
      </p>
      <ul>
        <li><strong>Know and access.</strong> Ask what we hold about you and get a copy.</li>
        <li><strong>Correct.</strong> Fix anything inaccurate.</li>
        <li><strong>Delete.</strong> Have your account and content erased.</li>
        <li><strong>Export.</strong> Receive your data in a common machine-readable format.</li>
        <li><strong>Object and restrict.</strong> Tell us to stop a particular use.</li>
        <li><strong>No retaliation.</strong> Exercising any of these will not get your access degraded or removed.</li>
      </ul>
      <p>
        If you are in the European Economic Area or the United Kingdom, you may also complain to your national data
        protection authority. We would rather you came to us first so we can fix it.
      </p>

      <h2>9. Children</h2>
      <p>
        The site is not for children under 13, and we do not knowingly collect their information. If you believe a
        child under 13 has created an account, write to us and we will delete it.
      </p>

      <h2>10. Security, stated honestly</h2>
      <p>
        Traffic runs over HTTPS. Passwords are hashed. The analysis backend is not exposed directly to the internet,
        and administrative endpoints require a secret token. Access to the production data is limited to the operator.
      </p>
      <p>
        This is a free service maintained by one person, not a bank. No system is impossible to breach, and we will not
        pretend otherwise. If a breach affects your data, we will tell you and the relevant regulator as quickly as we
        can, and we will say what actually happened.
      </p>

      <h2>11. International transfers</h2>
      <p>
        The site is operated from the United States and your data is processed there. If you use it from outside the
        United States, you are sending your information to a country whose data protection law may differ from your
        own.
      </p>

      <h2>12. Changes to this policy</h2>
      <p>
        If this policy changes, the date at the top changes with it, and a material change will be announced on the
        site before it takes effect. Previous versions are kept, and we will send you one on request.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions, requests, or a complaint:{" "}
        <a href="mailto:contact@intrinsicfined.org">contact@intrinsicfined.org</a>.
      </p>
    </LegalLayout>
  );
}
