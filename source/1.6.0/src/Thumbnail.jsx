import React, { useEffect, useState } from "react";
import { requestThumbnail } from "./thumbnail-client";
import { api } from "./api";
export function useThumbnail(image, edge) {
  const [state, setState] = useState({ url: "", failed: false });
  useEffect(() => {
    let live = true,
      url;
    if (!api.isDesktop) {
      setState({ url: image.thumbnail, failed: false });
      return;
    }
    setState({ url: "", failed: false });
    const request = requestThumbnail(image.id, edge);
    request.promise
      .then((result) => {
        if (!live || result.cancelled) return;
        if (result.error) {
          setState({ url: "", failed: true });
          return;
        }
        url = URL.createObjectURL(
          new Blob([result.data], { type: result.type }),
        );
        setState({ url, failed: false });
      })
      .catch(() => {
        if (live) setState({ url: "", failed: true });
      });
    return () => {
      live = false;
      request.cancel();
      // Give Chromium's resource loader a turn to detach an unmounted <img>
      // before revoking its URL. Immediate revocation can race a pending load.
      if (url) setTimeout(() => URL.revokeObjectURL(url), 250);
    };
  }, [image.id, image.thumbnail, edge]);
  return state;
}
export function ThumbnailPreview({ image }) {
  const { url } = useThumbnail(image, 320);
  return url ? (
    <img className="viewer-placeholder" src={url} alt="" aria-hidden="true" />
  ) : null;
}
