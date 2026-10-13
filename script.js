




const root = document.documentElement;                          // the <html> tag
const pages = Array.from(document.querySelectorAll(".page"));   // all 5 <section class="page">
const dock = document.getElementById("dock");                   // the navigation bar
const highlight = document.getElementById("dock-highlight");    // the sage pill
const tip = document.getElementById("dock-tip");                // the small tooltip
const dockLinks = Array.from(dock.querySelectorAll("a"));       // the 5 dock links

// true if the visitor disabled animations in their system settings
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// State variables (they change while the page is used)
let current = null;        // id of the active section ("home", "skills"...)
let dragging = false;      // true while the user drags on the dock
let hoverLink = null;      // dock link currently under the finger/mouse while dragging
let activePointer = null;  // id of the pointer (mouse/finger) used for the drag


/* ------------------------------------------------------------
   2. PREPARE THE REVEAL ANIMATION
   Each block gets a number --i (0, 1, 2...). The CSS uses it to
   delay each block by 80ms -> text appears one after the other.
------------------------------------------------------------ */
pages.forEach((page) => {
  // All blocks that must appear in this section
  const items = page.querySelectorAll(
    ".page-inner > .page-title, " +
    ".page-inner > .hero-header, " +
    ".page-inner > .bento-grid, " +
    ".page-body > *"
  );

  // j = position of the block in the section
  items.forEach((el, j) => {
    el.style.setProperty("--i", j);
  });
});

// IntersectionObserver = the browser tells us when an element enters/leaves the screen.
// We add the class "in-view" when the section is visible -> the CSS then plays "reveal".
// The class is removed when the section leaves, so the animation REPLAYS on return.
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        // toggle(class, true/false) = add if visible, remove if not
        entry.target.classList.toggle("in-view", entry.isIntersecting);
      });
    },
    // rootMargin shrinks the detection zone by 12% top/bottom:
    // a section counts as "visible" when it reaches the middle of the screen
    { rootMargin: "-12% 0px -12% 0px", threshold: 0 }
  );

  pages.forEach((page) => io.observe(page));
} else {
  // Very old browser: show everything directly
  pages.forEach((page) => page.classList.add("in-view"));
}



// Moves the sage pill (and the tooltip) behind the given link
function moveHighlight(link) {
  if (!link) return;

  // Same width as the link
  highlight.style.width = link.offsetWidth + "px";
  // offsetLeft = distance of the link from the left of the dock
  highlight.style.transform = `translateX(${link.offsetLeft}px)`;
  // Tooltip centered above the link, with the link's text
  tip.style.left = link.offsetLeft + link.offsetWidth / 2 + "px";
  tip.textContent = link.textContent;

  // Only the given link gets the class "active" (dark text on sage)
  dockLinks.forEach((l) => l.classList.toggle("active", l === link));
}

// Finds the dock link whose data-target equals the section id
function linkFor(id) {
  return dockLinks.find((link) => link.dataset.target === id);
}


/* ------------------------------------------------------------
   4. ACTIVE SECTION + PROGRESS + SCROLL
------------------------------------------------------------ */
// Declares a section as active
function setActive(id) {
  const page = document.getElementById(id);
  if (!page || !pages.includes(page)) return;   // unknown id: do nothing

  current = id;

  // Writes the section number in <html data-s="..."> ->
  // the CSS moves the background blobs to the matching position
  root.dataset.s = pages.indexOf(page);

  moveHighlight(linkFor(id));   // slide the pill

  // Updates the URL (#skills) without adding a history entry
  try {
    history.replaceState(null, "", "#" + id);
  } catch (error) {}   // some environments forbid it: ignore
}

// Which section is in the middle of the screen right now?
function sectionInView() {
  // y position of the middle of the screen, in page coordinates
  const mid = window.scrollY + window.innerHeight * 0.5;

  // Walk from the last section to the first; the first one that starts
  // above the middle line is the current one
  for (let i = pages.length - 1; i >= 0; i--) {
    if (pages[i].offsetTop <= mid) return pages[i];
  }
  return pages[0];
}

// Updates the active section only if it changed
function sync() {
  const id = sectionInView().id;
  if (id !== current) setActive(id);
}

// Progress bar: writes a value between 0 and 1 in --progress (used by the CSS scaleX)
function updateProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight; // total scrollable distance
  const p = max > 0 ? window.scrollY / max : 0;                           // fraction scrolled

  root.style.setProperty("--progress", Math.min(1, Math.max(0, p)));      // clamp between 0 and 1
}

// While a smooth scroll started by a button is running, the page passes
// through several sections. "locked" ignores those in-between sections
// so the dock doesn't flicker.
let locked = false;
let lockTimer;

function lockScroll() {
  locked = true;
  clearTimeout(lockTimer);
  lockTimer = setTimeout(() => { locked = false; }, 1500);  // safety: unlock after 1.5s
}

// Runs on every scroll. { passive: true } = better scroll performance.
window.addEventListener(
  "scroll",
  () => {
    updateProgress();

    if (dragging) return;   // dragging on the dock: don't change section

    if (locked) {
      // Wait until the scroll stops (150ms without scroll), then resync
      clearTimeout(lockTimer);
      lockTimer = setTimeout(() => {
        locked = false;
        sync();
      }, 150);
      return;
    }

    sync();
  },
  { passive: true }
);


/* ------------------------------------------------------------
   5. GO TO A SECTION
------------------------------------------------------------ */
function goTo(id) {
  const page = document.getElementById(id);
  if (!page || !pages.includes(page)) return;

  lockScroll();     // ignore the scroll events caused by this movement
  setActive(id);    // update dock + blobs immediately (no waiting for the scroll)

  page.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",  // instant if animations are disabled
    block: "start",                               // align the section with the top of the screen
  });
}


/* ------------------------------------------------------------
   6. DRAG AND RELEASE ON THE DOCK
   Press on the dock, slide left/right, release on a link = go there.
------------------------------------------------------------ */
// Returns the dock link whose center is closest to the x position
function linkAtX(clientX) {
  let best = dockLinks[0];
  let bestDistance = Infinity;

  dockLinks.forEach((link) => {
    const rect = link.getBoundingClientRect();                       // position/size on screen
    const distance = Math.abs(clientX - (rect.left + rect.width / 2)); // distance to the link center

    if (distance < bestDistance) {
      bestDistance = distance;
      best = link;
    }
  });

  return best;
}

// Ends the drag. commit = true -> go to the chosen link; false -> cancel.
function endDrag(commit) {
  if (!dragging) return;

  dragging = false;
  dock.classList.remove("dragging");   // hides the tooltip, normal cursor

  try {
    dock.releasePointerCapture(activePointer);
  } catch (error) {}

  const target = hoverLink;
  hoverLink = null;
  activePointer = null;

  if (commit && target) {
    goTo(target.dataset.target);        // released on a link: go to its section
  } else {
    moveHighlight(linkFor(current));    // cancelled: pill returns to the active link
  }
}

// Press: start the drag
dock.addEventListener("pointerdown", (event) => {
  if (!dockLinks.length) return;

  dragging = true;
  activePointer = event.pointerId;

  // setPointerCapture = the dock keeps receiving events even if the
  // finger/mouse leaves its area while dragging
  dock.setPointerCapture(event.pointerId);
  dock.classList.add("dragging");

  hoverLink = linkAtX(event.clientX);
  moveHighlight(hoverLink);
});

// Move: the pill follows the closest link
dock.addEventListener("pointermove", (event) => {
  if (!dragging) return;

  const link = linkAtX(event.clientX);

  if (link && link !== hoverLink) {
    hoverLink = link;
    moveHighlight(link);
  }
});

// Release: confirm. Cancel (e.g. phone interrupts the touch): don't go anywhere.
dock.addEventListener("pointerup", () => endDrag(true));
dock.addEventListener("pointercancel", () => endDrag(false));


/* ------------------------------------------------------------
   7. KEYBOARD AND LOGO
------------------------------------------------------------ */
dockLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();   // cancels the default jump to #section

    // event.detail === 0 means the click came from the keyboard (Enter/Space).
    // With a mouse, the "pointerup" handler above already did the job.
    if (event.detail === 0) goTo(link.dataset.target);
  });
});

// Click on "ferrat ilham" (bottom right) -> back to home
const brand = document.querySelector(".brand");

if (brand) {
  brand.addEventListener("click", (event) => {
    event.preventDefault();
    goTo("home");
  });
}

// Keyboard shortcuts
document.addEventListener("keydown", (event) => {
  // Escape while dragging = cancel the drag
  if (event.key === "Escape" && dragging) {
    endDrag(false);
    return;
  }

  if (dragging) return;

  // Index of the active section (0..4)
  const index = pages.findIndex((page) => page.id === current);

  // Right arrow = next section, Left arrow = previous section
  if (event.key === "ArrowRight" && index < pages.length - 1) {
    goTo(pages[index + 1].id);
  }

  if (event.key === "ArrowLeft" && index > 0) {
    goTo(pages[index - 1].id);
  }
});


/* ------------------------------------------------------------
   8. INITIALIZATION (runs once when the page loads)
------------------------------------------------------------ */
if (pages.length) {
  // If the URL has a hash (e.g. site.html#skills), find that section
  const hashPage = pages.find((page) => "#" + page.id === window.location.hash);

  // Jump there instantly (no animation) when it isn't the first section
  if (hashPage && hashPage !== pages[0]) {
    hashPage.scrollIntoView({ behavior: "auto", block: "start" });
  }

  setActive((hashPage || sectionInView()).id);
  updateProgress();
}

// After everything is loaded (images, fonts) the sizes are final: recompute
window.addEventListener("load", () => {
  sync();
  updateProgress();
  moveHighlight(linkFor(current));
});

// When the window is resized, the pill position and progress must be recomputed
window.addEventListener("resize", () => {
  updateProgress();
  moveHighlight(linkFor(current));
});


/* ------------------------------------------------------------
   9. FOOTER YEAR
   Replaces the text of <span id="year"> with the current year.
------------------------------------------------------------ */
const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();


/* ------------------------------------------------------------
   10. TYPING EFFECT on <p id="role">
   Writes a word letter by letter, waits, erases it, then writes the next.
------------------------------------------------------------ */
const role = document.getElementById("role");

// Only if the element exists AND animations are allowed
if (role && !reduceMotion) {
  const words = ["Future Cybersecurity Engineer", "Front-End Developer", "Problem Solver"]; // phrases to show
  let w = 0;            // index of the current phrase
  let c = 0;            // number of letters currently shown
  let deleting = false; // false = writing, true = erasing

  // Self-running function: (function name() { ... })();
  (function type() {
    const word = words[w];

    c += deleting ? -1 : 1;              // +1 letter when writing, -1 when erasing
    role.textContent = word.slice(0, c); // show only the first c letters

    let delay = deleting ? 35 : 70;      // ms before the next step (erasing is faster)

    if (!deleting && c === word.length) {
      // Word fully written: pause 1.6s, then start erasing
      deleting = true;
      delay = 1600;
    } else if (deleting && c === 0) {
      // Word fully erased: go to the next word (loops back to 0 at the end)
      deleting = false;
      w = (w + 1) % words.length;
      delay = 300;
    }

    setTimeout(type, delay);   // call itself again after "delay" ms = the loop
  })();
}


/* ------------------------------------------------------------
   11. SKILLS : FILTERS + CLICK
   (This part was missing in the script you sent: without it the
   skill buttons and filters do nothing.)
------------------------------------------------------------ */
const filters = document.querySelectorAll(".chip-filter");   // the 5 filter buttons
const skills = document.querySelectorAll(".skill");          // all skill buttons
const info = document.getElementById("skill-info");          // the "Used in..." line
const defaultInfo = info ? info.textContent : "";            // remembers the default sentence

// Gives each skill a number --k: the CSS uses it to make them pop in one by one
skills.forEach((s, k) => s.style.setProperty("--k", k));

// Click on a filter
filters.forEach((btn) => {
  btn.addEventListener("click", () => {
    // Only the clicked filter keeps the "active" look
    filters.forEach((b) => b.classList.toggle("active", b === btn));

    const f = btn.dataset.filter;   // "all", "technical", "tools"...

    // Hide every skill whose category doesn't match (unless "all")
    skills.forEach((s) => s.classList.toggle("hide", f !== "all" && s.dataset.cat !== f));
  });
});

// Click on a skill
skills.forEach((s) => {
  s.addEventListener("click", () => {
    // Was it already selected? (then this click un-selects it)
    const on = !s.classList.contains("selected");

    skills.forEach((x) => x.classList.remove("selected"));  // clear all selections
    s.classList.toggle("selected", on);                     // select this one (or not)

    // Text under the skills:
    // - selected + has data-used -> "Used in: ..."
    // - selected, no data-used   -> generic sentence
    // - un-selected              -> default sentence
    info.textContent = on
      ? (s.dataset.used ? "Used in: " + s.dataset.used : "Part of my everyday toolkit.")
      : defaultInfo;
  });
});


/* ------------------------------------------------------------
   12. GLOW THAT FOLLOWS THE CURSOR
   On mouse move over a row, project or card, we write the mouse
   position (relative to that element) in --mx / --my.
   The CSS ::before uses them to center the glow.
------------------------------------------------------------ */
document.querySelectorAll(".row, .project, .bento-card").forEach((el) => {
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();                    // element position on screen
    el.style.setProperty("--mx", e.clientX - r.left + "px"); // mouse x inside the element
    el.style.setProperty("--my", e.clientY - r.top + "px");  // mouse y inside the element
  });
});


/* ------------------------------------------------------------
   13. COPY EMAIL BUTTON
------------------------------------------------------------ */
const copyBtn = document.getElementById("copy-mail");

if (copyBtn) {
  // async/await because copying to the clipboard takes a moment
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText("ai.ferrat@ensta.edu.dz");  // copy
      copyBtn.textContent = "copied ✓";                               // success message
    } catch (e) {
      copyBtn.textContent = "copy failed";                            // blocked by the browser
    }
    // After 1.8s the button text goes back to normal
    setTimeout(() => { copyBtn.textContent = "copy email"; }, 1800);
  });
}