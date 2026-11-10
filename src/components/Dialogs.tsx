import { ReactNode, useEffect, useRef } from 'react';
import { CHEF_NAME } from '../config';

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={`dlg-${title}`}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {/* Contents only while open: keeps closed dialogs out of the page outline (and the pre-rendered HTML). */}
      {open && (
        <div className="modal-body">
          <h2 id={`dlg-${title}`}>{title}</h2>
          {children}
          <button type="button" className="btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </dialog>
  );
}

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="How to play">
      <ul className="help-list">
        <li>
          You have <strong>$50 per guest</strong> to fill five courses: appetizer, soup, salad, main course and dessert.
        </li>
        <li>Each turn, today’s inspiration reveals a cuisine and an ingredient. Matching dishes appear below.</li>
        <li>Tap a dish to preview it, then serve it. Fill courses in any order. A served course is final.</li>
        <li>You always keep enough money to finish every course, so some pricey dishes may wait.</li>
        <li>
          Your restaurant’s rating is the plain average of your five dish ratings. Money you save is shown but doesn’t
          change the stars.
        </li>
      </ul>
      <p className="fineprint">
        {CHEF_NAME} is here to keep you company; her comments never change your score. Prices and ratings are fictional
        game values. Ingredient tags are not an allergy guide. <a href="./privacy/">Privacy</a>
      </p>
    </Modal>
  );
}

export function SettingsDialog(props: {
  open: boolean;
  onClose: () => void;
  reduceMotion: boolean;
  systemReduced: boolean;
  onReduceMotion: (v: boolean) => void;
  muted: boolean;
  onToggleMute: () => void;
  onNewRun: () => void;
  onQuit: () => void;
}) {
  return (
    <Modal open={props.open} onClose={props.onClose} title="Settings">
      <label className="toggle">
        <input
          type="checkbox"
          checked={props.reduceMotion || props.systemReduced}
          disabled={props.systemReduced}
          onChange={(e) => props.onReduceMotion(e.target.checked)}
        />
        <span>Reduce motion{props.systemReduced ? ' (on in your device settings)' : ''}</span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={!props.muted} onChange={props.onToggleMute} />
        <span>Sound effects</span>
      </label>
      <div className="settings-actions">
        <button type="button" className="btn secondary" onClick={props.onNewRun}>
          Start a new menu
        </button>
        <button type="button" className="btn ghost" onClick={props.onQuit}>
          Back to title
        </button>
      </div>
    </Modal>
  );
}
