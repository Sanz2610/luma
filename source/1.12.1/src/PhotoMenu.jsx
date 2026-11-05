import React, { useLayoutEffect, useRef } from "react";
import { FolderOpen, Info, ScanSearch, Trash2, Image } from "lucide-react";

export default function PhotoMenu({ image, x, y, onClose, onAction }) {
  const menu = useRef(null);
  useLayoutEffect(() => {
    const box = menu.current;
    const previous = document.activeElement;
    const rect = box.getBoundingClientRect();
    box.style.left = `${Math.max(6, Math.min(x, innerWidth - rect.width - 6))}px`;
    box.style.top = `${Math.max(6, Math.min(y, innerHeight - rect.height - 6))}px`;
    box.querySelector("button")?.focus();
    const dismiss = (event) => {
      if (!box.contains(event.target)) onClose();
    };
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [x, y, onClose]);
  return (
    <div
      ref={menu}
      className="photo-menu"
      role="menu"
      aria-label={`Actions for ${image.name}`}
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        const buttons = [...menu.current.querySelectorAll("button")];
        const current = buttons.indexOf(document.activeElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const index =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (current +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons[index].focus();
        }
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {[
        ["open", "Open", Image],
        ["reveal", "Show in Explorer", FolderOpen],
        ["lens", "Search with Google Lens", ScanSearch],
        ["properties", "Properties", Info],
        ["delete", "Delete", Trash2],
      ].map(([action, label, Icon]) => (
        <button
          key={action}
          role="menuitem"
          className={action === "delete" ? "menu-delete" : ""}
          onClick={() => onAction(action, image)}
        >
          <Icon size={16} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
