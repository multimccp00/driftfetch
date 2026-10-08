import { privacyNote } from "../shared/privacy-note";

/** The privacy note as shown on first launch and in Settings > Privacy. */
export function PrivacyNote() {
  return (
    <div className="privacy-note">
      <p className="privacy-summary">{privacyNote.summary}</p>
      {privacyNote.sections.map((section) => (
        <section key={section.heading}>
          <h3>{section.heading}</h3>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
    </div>
  );
}
