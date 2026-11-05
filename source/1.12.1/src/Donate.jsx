import React, { useState } from "react";
import { Coffee, Copy, ArrowUpRight } from "lucide-react";
import donations from "../electron/donations.json";
import hdbank from "./assets/donate/hdbank.png";
import techcombank from "./assets/donate/techcombank.png";
import momo from "./assets/donate/momo.png";
import { api } from "./api";
import { errorText } from "./ui";
const images = { hdbank, techcombank, momo };
export default function Donate() {
  const [method, setMethod] = useState("hdbank"),
    [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  const bank = donations.banks[method];
  const action = async (fn) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <details className="about-donate">
      <summary>
        <Coffee size={14} /> Donate
      </summary>
      <div className="donate-content">
        <p>
          If Luma is useful to you, a coffee helps support its development.
          Thank you!
        </p>
        <button
          className="button donate-paypal"
          onClick={() => action(() => api.openProjectLink("donate"))}
        >
          PayPal <ArrowUpRight size={12} />
        </button>
        <div className="donate-methods" aria-label="Donation method">
          {Object.entries({ ...donations.banks, momo: { name: "MoMo" } }).map(
            ([key, item]) => (
              <button
                key={key}
                aria-pressed={method === key}
                onClick={() => {
                  setMethod(key);
                  setCopied(false);
                  setError("");
                }}
              >
                {item.name}
              </button>
            ),
          )}
        </div>
        <img
          className="donate-qr"
          src={images[method]}
          alt={`${bank?.name || "MoMo"} donation QR code`}
        />
        {bank ? (
          <>
            <div className="donate-account">
              <span>{bank.display}</span>
              <button
                title="Copy account number"
                aria-label="Copy account number"
                onClick={() =>
                  action(async () => {
                    await api.copyDonationAccount(method);
                    setCopied(true);
                  })
                }
              >
                <Copy size={13} />
              </button>
            </div>
            <p>{donations.recipient}</p>
            <span className="donate-copied" role="status">
              {copied ? "Account number copied." : ""}
            </span>
          </>
        ) : (
          <p>Scan with the MoMo app.</p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
