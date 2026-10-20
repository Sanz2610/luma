import React, { useState } from "react";
import { Aperture, ArrowUpRight, ExternalLink } from "lucide-react";
import { Modal, errorText } from "./ui";
import { api } from "./api";
import { version } from "../package.json";
import licenseText from "../LICENSE?raw";
import Donate from "./Donate";

export default function About({ onClose }) {
  const [error, setError] = useState("");
  const open = async (key) => {
    setError("");
    try {
      await api.openProjectLink(key);
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <Modal title="About Luma" className="about-scrim" onClose={onClose}>
      <div className="about-brand">
        <span className="about-mark">
          <Aperture size={28} />
        </span>
        <div>
          <h3>
            Luma <span>{version}</span>
          </h3>
          <p>Your photos, in focus.</p>
        </div>
      </div>
      <p className="about-description">
        A focused photo browser for Windows. Big photo grids, folder tabs and an
        independent viewer — with your originals in place.
      </p>
      <div className="about-credit">
        <span>Created and maintained by</span>
        <button className="about-developer" onClick={() => open("developer")}>
          Sanz2610 <ArrowUpRight size={13} />
        </button>
        <p>Free and open source · MIT License</p>
      </div>
      <div className="about-links">
        <button className="button" onClick={() => open("github")}>
          <ExternalLink size={16} /> GitHub <ArrowUpRight size={12} />
        </button>
      </div>
      <details className="about-license">
        <summary>MIT License</summary>
        <pre>{licenseText}</pre>
      </details>
      <Donate />
      <p className="about-copyright">
        © 2026 Sanz2610. Developed with assistance from OpenAI Codex.
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
