"use client";

import FeedbackForm from "./FeedbackForm";

/** Pouce haut / bas après une séance — version courte du formulaire retour. */
export default function SessionPulseFeedback({
  onSent,
}: {
  onSent?: () => void;
}) {
  return (
    <FeedbackForm
      source="wrap_up"
      compact
      title="Comment c'était ?"
      subtitle="Un pouce, un mot — un bouton."
      onSent={onSent}
    />
  );
}
