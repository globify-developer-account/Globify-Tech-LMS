import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";
import { buildMetadata } from "@/lib/seo";
import { site } from "@/config/site";

// Google Play requires this page to stay publicly reachable (Data safety > "Delete account URL").
export const metadata: Metadata = buildMetadata({
  title: "Delete your account",
  description: "How to delete your Globify Tech account and associated data.",
  path: "/delete-account",
});

export default function DeleteAccountPage() {
  const email = site.contact.email;
  const phone = site.contact.admissionsPhone;
  const wa = site.contact.whatsapp;
  return (
    <>
      <PageHero
        eyebrow="Your data"
        title="Delete your Globify Tech account"
        description="How users of the Globify Tech website and the Globify Tech Android app can request deletion of their account and personal data."
        crumbs={[{ label: "Home", href: "/" }, { label: "Delete account" }]}
      />
      <div className="container-x py-12 md:py-16">
        <div className="prose-globify max-w-3xl">
          <h2>How to request deletion</h2>
          <ol>
            <li>
              Email <a href={`mailto:${email}?subject=Account%20deletion%20request`}>{email}</a> from the email
              address registered to your account, with the subject &ldquo;Account deletion request&rdquo;.
            </li>
            <li>Include your full name and, if you only want some data removed, say which data.</li>
            <li>We will confirm your request and complete the deletion within 30 days.</li>
          </ol>
          <p>
            You can also call us at <a href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a> or WhatsApp{" "}
            <a href={`https://wa.me/${wa.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">
              {wa}
            </a>
            .
          </p>

          <h2>What we delete</h2>
          <ul>
            <li>Your profile: name, email address, phone number and login details</li>
            <li>Course enrollments, progress, attendance, quiz and exam results</li>
            <li>Assignment files and other documents you uploaded</li>
            <li>Messages and notification preferences</li>
          </ul>

          <h2>What we keep, and for how long</h2>
          <ul>
            <li>
              Payment and invoice records are kept for up to 5 years where required by tax and accounting law, then
              deleted.
            </li>
            <li>
              Certificate IDs we have issued may be kept so employers can still verify them. Contact us if you want
              these removed as well.
            </li>
            <li>Backups are overwritten within 90 days.</li>
          </ul>

          <h2>Delete some data without closing your account</h2>
          <p>
            Email us with the specific data you want removed (for example, uploaded files) and we will delete it
            without closing your account.
          </p>
        </div>
      </div>
    </>
  );
}
