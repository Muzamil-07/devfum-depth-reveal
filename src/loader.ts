export type ExperienceLoader = {
  setProgress: (value: number) => void;
  setStatus: (text: string) => void;
  complete: () => Promise<void>;
  fail: (message?: string) => void;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function createExperienceLoader(): ExperienceLoader {
  const root = document.getElementById("boot");
  const fill = document.getElementById("boot-fill");
  const percentEl = document.getElementById("boot-percent");
  const statusEl = document.getElementById("boot-status");
  const hint = document.getElementById("hint");
  const hintCopy = document.getElementById("hint-copy");

  if (!root || !fill || !percentEl || !statusEl || !hint || !hintCopy) {
    return {
      setProgress() {},
      setStatus() {},
      async complete() {},
      fail() {},
    };
  }

  let target = 0;
  let display = 0;
  let raf = 0;
  let settling = false;

  const render = (value: number) => {
    const shown = Math.round(value);
    percentEl.textContent = String(shown);
    fill.style.width = `${value}%`;
    root.setAttribute("aria-valuenow", String(shown));
  };

  const tick = () => {
    const ease = settling ? 0.22 : 0.1;
    display += (target - display) * ease;
    if (Math.abs(target - display) < 0.08) display = target;
    render(display);
    if (display < 100 || target < 100) {
      raf = requestAnimationFrame(tick);
    }
  };

  raf = requestAnimationFrame(tick);

  const waitForDisplay = (goal: number, timeout = 1600) =>
    new Promise<void>((resolve) => {
      const started = performance.now();
      const check = () => {
        if (display >= goal - 0.2 || performance.now() - started > timeout) {
          display = Math.max(display, goal);
          render(display);
          resolve();
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });

  const showHint = () => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    hintCopy.textContent = coarse
      ? "Move your finger to see the depth reveal"
      : "Move your cursor to see the depth reveal";

    hint.classList.add("is-visible");
    hint.setAttribute("aria-hidden", "false");

    let hidden = false;
    const hide = () => {
      if (hidden) return;
      hidden = true;
      hint.classList.remove("is-visible");
      hint.classList.add("is-gone");
      hint.setAttribute("aria-hidden", "true");
      window.removeEventListener("pointermove", onInteract);
      window.removeEventListener("pointerdown", onInteract);
    };

    const onInteract = () => {
      window.setTimeout(hide, 1100);
    };

    window.addEventListener("pointermove", onInteract, { passive: true });
    window.addEventListener("pointerdown", onInteract, { passive: true });
    window.setTimeout(hide, 7000);
  };

  return {
    setProgress(value: number) {
      target = Math.max(target, clamp(value));
    },
    setStatus(text: string) {
      statusEl.textContent = text;
    },
    async complete() {
      settling = true;
      target = 100;
      this.setStatus("Ready");
      await waitForDisplay(100);
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      cancelAnimationFrame(raf);
      display = 100;
      render(100);

      root.classList.add("is-done");
      root.setAttribute("aria-busy", "false");
      document.documentElement.classList.remove("is-booting");
      document.body.classList.remove("is-booting");

      window.setTimeout(showHint, 560);
    },
    fail(message = "Could not load the sculpture") {
      cancelAnimationFrame(raf);
      this.setStatus(message);
      root.classList.add("is-failed");
    },
  };
}
