window.videoDecoder.onJob(async (job) => {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  video.crossOrigin = "anonymous";
  const wait = (name) =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => finish(new Error("Video decoder timed out")),
        7000,
      );
      const ok = () => finish();
      const fail = () =>
        finish(new Error(video.error?.message || "Video codec unsupported"));
      const finish = (error) => {
        clearTimeout(timeout);
        video.removeEventListener(name, ok);
        video.removeEventListener("error", fail);
        error ? reject(error) : resolve();
      };
      video.addEventListener(name, ok, { once: true });
      video.addEventListener("error", fail, { once: true });
    });
  try {
    const ready = wait("loadedmetadata");
    video.src = job.source;
    await ready;
    const result = {
      id: job.id,
      secret: job.secret,
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
    };
    if (result.width * result.height > 64 * 1024 * 1024)
      throw new Error("Video too large");
    if (typeof job.edge === "number") {
      const seek = wait("seeked");
      video.currentTime = Math.min(
        1,
        Number.isFinite(video.duration) ? video.duration / 4 : 0.1,
      );
      await seek;
      const scale = Math.min(
        1,
        job.edge / video.videoWidth,
        job.edge / video.videoHeight,
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas
        .getContext("2d")
        .drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.8),
      );
      if (!blob) throw new Error("Video frame unavailable");
      result.data = new Uint8Array(await blob.arrayBuffer());
    }
    window.videoDecoder.result(result);
  } catch (error) {
    window.videoDecoder.result({
      id: job.id,
      secret: job.secret,
      error: error.message,
    });
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  }
});
