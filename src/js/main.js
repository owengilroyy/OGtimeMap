import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Fix Leaflet's default marker icon paths, which break under Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// ---------------------------------------------------------------------------
// getChild()
// Helper: finds a direct child element by tag name.
// Uses tagName comparison instead of getElementsByTagName, which has
// proven unreliable for XML documents parsed with DOMParser in some browsers.
// ---------------------------------------------------------------------------
function getChild(node, tag) {
  if (!node) {
    console.log("getChild called with null node, tag:", tag);
    return null;
  }
  const result =
    Array.from(node.children).find((el) => el.tagName === tag) ?? null;
  // console.log(`getChild(${tag}):`, result);
  return result;
}

// ---------------------------------------------------------------------------
// parseDate()
// Reads a <date> node and returns a structured object.
// year and era are always present; month and day are optional.
// ---------------------------------------------------------------------------
function parseDate(dateNode) {
  const year = parseInt(getChild(dateNode, "year")?.textContent.trim(), 10);
  // ebb: In these variables for year, month, and day,
  // adding the `, 10` is a "radix", which tells JS to treat the data as base-10 numbers.
  // (This prevents the numbers from being misread as hexadecimal or octals or something.
  // Old JS engines used to presume left-padded
  // zeroes in numbers were octals! )
  // month and day are numbers; 0 means "not given"
  const month =
    parseInt(getChild(dateNode, "month")?.textContent.trim(), 10) || 0;
  const day = parseInt(getChild(dateNode, "day")?.textContent.trim(), 10) || 0;
  const era = getChild(dateNode, "era")?.textContent.trim();

  if (year === 0) {
    console.warn(
      "Year 0 does not exist in this scheme, no thanks to the monk  Dionysius Exiguus who came up with BC and AD with no year 0: (1 BC is followed by 1 AD).",
    );
  }

  return { year, month, day, era };
}

// ---------------------------------------------------------------------------
// ebb: Adding some help for handling / positioning fractional months
//  when dates start mid-year.
// Days per month (non-leap), used to turn a day into a fraction of a month.
// ---------------------------------------------------------------------------
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// ---------------------------------------------------------------------------
// toSignedYear()
// Converts a parsed date to a single number on a continuous timeline.
// BC 55 = -55, BC 1 = -1, (there is NO year 0!), AD 1 = 1, AD 1789 = 1789
// A date means the START of its most precise unit given:
//   1860 -> 1860.0   March 1860 -> 1860 + 2/12   14 March 1860 -> + a bit more
// For BC the fraction is added AFTER negating the year, so later months
// always move later in time (-100 + 0.5 is July of 100 BC).
// ---------------------------------------------------------------------------
function toSignedYear(parsedDate) {
  const base = parsedDate.era === "BC" ? -parsedDate.year : parsedDate.year;
  const { month, day } = parsedDate;
  if (!month) return base;
  const dayFrac = day ? (day - 1) / DAYS_IN_MONTH[month - 1] : 0;
  return base + (month - 1 + dayFrac) / 12;
}

// ---------------------------------------------------------------------------
// toPos()
// ebb: We want a **signed year**, for a continuous ruler position, removing where
// a year "0" would be. 1 BC occupies [0, 1) and 1 AD occupies [1, 2), so 1 BC to 1 AD
// is exactly one year wide. This helps us to turn the Year into an x coordinate: it's
// effectively positioned at 0 but signed at -1;
// Our labels and data are represented as "signed years", with their numbering as indicated.
// ---------------------------------------------------------------------------
const toPos = (year) => (year < 0 ? year + 1 : year);

// ---------------------------------------------------------------------------
// formatDate()
// Turns a parsed date object into a human-readable string.
// ---------------------------------------------------------------------------
function formatDate({ year, month, day, era }) {
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const parts = [];
  if (day) parts.push(parseInt(day));
  if (month) parts.push(monthNames[parseInt(month) - 1]);
  parts.push(year);
  if (era === "BC") parts.push("BC");
  return parts.join(" ");
}

function formatDateEnd({ year, month, day, era }) {
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const parts = [];
  if (day) parts.push(parseInt(day));
  if (month) parts.push(monthNames[parseInt(month) - 1]);
  parts.push(year);
  if (era === "BC") parts.push("BC");
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// parseEvents()
// Fetches public/events.xml and returns a plain JS array of event objects.
// Uses import.meta.env.BASE_URL so paths work in both dev and gh-pages.
// Reads both type="start" and type="end" date elements.
// ---------------------------------------------------------------------------
async function parseEvents() {
  const response = await fetch(`${import.meta.env.BASE_URL}events.xml`);
  const text = await response.text();
  const xml = new DOMParser().parseFromString(text, "application/xml");

  const trackNodes = Array.from(xml.documentElement.children);

  console.log(
    "first node type:",
    trackNodes[0].nodeType,
    "tag:",
    trackNodes[0].tagName,
  );

  return trackNodes.flatMap((trackNode) => {
    const track = Number(trackNode.getAttribute("type") ?? 1);
    const name = trackNode.getAttribute("name") ?? "";
    const eventNodes = Array.from(trackNode.children);

    return eventNodes.map((node) => {
      // Only <date> elements with content; an empty <date/> is ignored
      const dateNodes = Array.from(node.children).filter(
        (el) => el.tagName === "date" && el.children.length > 0,
      );
      console.log("dateNodes", dateNodes);
      const dates = dateNodes.map((dateNode) => parseDate(dateNode));
      const startDate = dates[0] ?? null;
      const endDate = dates[1] ?? null;

      return {
        track,
        name,
        title: getChild(node, "title")?.textContent.trim(),
        date: startDate,
        endDate,
        signedYearStart: startDate ? toSignedYear(startDate) : null,
        signedYearEnd: endDate ? toSignedYear(endDate) : null,
        displayDate: startDate ? formatDate(startDate) : "",
        displayDateEnd: endDate ? formatDate(endDate) : "",
        description: getChild(node, "description")?.textContent.trim(),
        lat: parseFloat(getChild(node, "lat")?.textContent),
        lon: parseFloat(getChild(node, "lon")?.textContent),
        media: getChild(node, "media")?.textContent.trim() ?? null,
      };
    });
  });
}
// ---------------------------------------------------------------------------
// getYearRange()
// Pools every start AND end date so the ruler covers the full span, whichever
// event holds the latest date. Returns the current year for both ends when no
// dates exist. Future dates are never capped: the current year is only the
// empty-data fallback.
// ---------------------------------------------------------------------------
function getYearRange(events) {
  const years = events
    .flatMap((e) => [e.signedYearStart, e.signedYearEnd])
    .filter((y) => Number.isFinite(y)); // drops nulls from single-date events

  if (years.length === 0) {
    const currentYear = new Date().getFullYear();
    // ebb: If there aren't any years, use this current year from the current dateTime (today() on our computer running this JS.)
    // We get today's year from getFullYear()
    return { minYear: currentYear, maxYear: currentYear };
  }
  return {
    minYear: Math.min(...years),
    maxYear: Math.max(...years),
  };
}

// ---------------------------------------------------------------------------
// buildMap()
// Initialises a Leaflet map and adds one marker per event.
// Clicking a marker triggers full event selection.
// ---------------------------------------------------------------------------
function buildMap(events, onSelect) {
  const map = L.map("map").setView([48.8566, 2.3522], 4);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  var pinIcon = L.icon({
    iconUrl: "./images/pin.png",
    iconSize: [50, 60],
    iconAnchor: [25, 60],
    popupAnchor: [0, -60],
  });

  events.forEach((event, index) => {
    const marker = L.marker([event.lat, event.lon], { icon: pinIcon })
      .addTo(map)
      .bindPopup(`<strong>${event.title}</strong><br>${event.displayDate}`);

    marker.on("click", () => onSelect(index));
  });

  return map;
}

// ---------------------------------------------------------------------------
// buildCard()
// Renders the SVG detail card panel for the currently selected event.
// ---------------------------------------------------------------------------
function buildCard(event, index, events, onSelect) {
  const panel = document.getElementById("card-panel");
  panel.innerHTML = "";

  const screenWidth = window.innerWidth;
  const svgHeight = 159;
  const svgWidth = screenWidth;

  const svgNS = "http://www.w3.org/2000/svg";

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
  svg.setAttribute("width", svgWidth);
  svg.setAttribute("height", svgHeight);
  svg.style.flexShrink = 0;

  const Hline1 = document.createElementNS(svgNS, "line");
  Hline1.setAttribute("x1", 0);
  Hline1.setAttribute("y1", 40);
  Hline1.setAttribute("x2", svgWidth);
  Hline1.setAttribute("y2", 40);
  Hline1.setAttribute("stroke", "#173aff");
  Hline1.setAttribute("stroke-width", 3);
  svg.appendChild(Hline1);

  const Hline2 = document.createElementNS(svgNS, "line");
  Hline2.setAttribute("x1", 0);
  Hline2.setAttribute("y1", 65);
  Hline2.setAttribute("x2", svgWidth);
  Hline2.setAttribute("y2", 65);
  Hline2.setAttribute("stroke", "#173aff");
  Hline2.setAttribute("stroke-width", 3);
  svg.appendChild(Hline2);

  const Hline3 = document.createElementNS(svgNS, "line");
  Hline3.setAttribute("x1", 0);
  Hline3.setAttribute("y1", 90);
  Hline3.setAttribute("x2", svgWidth);
  Hline3.setAttribute("y2", 90);
  Hline3.setAttribute("stroke", "#173aff");
  Hline3.setAttribute("stroke-width", 3);
  svg.appendChild(Hline3);

  const Hline4 = document.createElementNS(svgNS, "line");
  Hline4.setAttribute("x1", 0);
  Hline4.setAttribute("y1", 115);
  Hline4.setAttribute("x2", svgWidth);
  Hline4.setAttribute("y2", 115);
  Hline4.setAttribute("stroke", "#173aff");
  Hline4.setAttribute("stroke-width", 3);
  svg.appendChild(Hline4);

  const Hline5 = document.createElementNS(svgNS, "line");
  Hline5.setAttribute("x1", 0);
  Hline5.setAttribute("y1", 140);
  Hline5.setAttribute("x2", svgWidth);
  Hline5.setAttribute("y2", 140);
  Hline5.setAttribute("stroke", "#173aff");
  Hline5.setAttribute("stroke-width", 3);
  svg.appendChild(Hline5);

  const Hline6 = document.createElementNS(svgNS, "line");
  Hline6.setAttribute("x1", 0);
  Hline6.setAttribute("y1", 165);
  Hline6.setAttribute("x2", svgWidth);
  Hline6.setAttribute("y2", 165);
  Hline6.setAttribute("stroke", "#173aff");
  Hline6.setAttribute("stroke-width", 15);
  svg.appendChild(Hline6);

  const Vline = document.createElementNS(svgNS, "line");
  Vline.setAttribute("x1", 30);
  Vline.setAttribute("y1", 0);
  Vline.setAttribute("x2", 30);
  Vline.setAttribute("y2", svgHeight);
  Vline.setAttribute("stroke", "#ff0000");
  Vline.setAttribute("stroke-width", 6);
  svg.appendChild(Vline);

  const date = document.createElementNS(svgNS, "text");
  date.setAttribute("class", "card-date");
  date.setAttribute("x", 40);
  date.setAttribute("y", 35);
  date.setAttribute("fill", "#ff0000");
  date.textContent = `${event.displayDate}`;
  svg.appendChild(date);

  if (event.displayDateEnd !== "") {
    date.textContent = date.textContent.concat(" - ", event.displayDateEnd);
  }
  const title = document.createElementNS(svgNS, "text");
  title.setAttribute("class", "card-title");
  title.setAttribute("x", 40);
  title.setAttribute("y", 62);
  title.setAttribute("fill", "#173aff");
  title.textContent = `${event.title}`;
  svg.appendChild(title);

  const desc = document.createElementNS(svgNS, "text");
  desc.setAttribute("class", "card-desc");
  desc.setAttribute("x", 40);
  desc.setAttribute("y", 89);
  desc.setAttribute("fill", "#363636");
  desc.textContent = `${event.description}`;
  svg.appendChild(desc);

  console.log(events);
  console.log(index);

  // Next button — only show if there's a next event
  if (index < events.length - 1) {
    const nextBtn = document.createElementNS(svgNS, "g");
    nextBtn.style.cursor = "pointer";
    nextBtn.addEventListener("click", () => onSelect(index + 1));
    svg.appendChild(nextBtn);

    const arrow = document.createElementNS(svgNS, "image");
    arrow.setAttribute("href", "./images/arrow.png");
    arrow.setAttribute("x", screenWidth - 200);
    arrow.setAttribute("y", 5); /* ebb: changed from y of 55 */
    /* ebb: Moved to CSS: Need a more flexible way to set the width on these arrows relative to viewport.
    arrow.setAttribute("width", 200); arrow.setAttribute("height", 120)*/
    arrow.setAttribute("class", "arrow");
    nextBtn.appendChild(arrow);

    console.log(arrow);
  }

  // Previous button — only show if there's a previous event
  if (index > 0) {
    const prevBtn = document.createElementNS(svgNS, "g");
    prevBtn.style.cursor = "pointer";
    prevBtn.addEventListener("click", () => onSelect(index - 1));
    svg.appendChild(prevBtn);

    const arrowB = document.createElementNS(svgNS, "image");
    arrowB.setAttribute("href", "./images/arrowB.png");
    arrowB.setAttribute("x", screenWidth - 300);
    arrowB.setAttribute("y", 5);
    /* ebb: Moved to CSS: Need a more flexible way to set the width on these arrows relative to viewport.
    arrowB.setAttribute("width", 200); arrowB.setAttribute("height", 120)*/
    arrowB.setAttribute("class", "arrow");
    prevBtn.appendChild(arrowB);
  }

  panel.appendChild(svg);

  const maxTextWidth = screenWidth - 40 - 320; // left margin, then room for the arrows
  fitTextToLines(desc, event.description ?? "", maxTextWidth);

  const titleWidth = title.getComputedTextLength();

  const highlight = document.createElementNS(svgNS, "line");
  highlight.setAttribute("x1", 35);
  highlight.setAttribute("y1", 52.5);
  highlight.setAttribute("x2", 40 + titleWidth);
  highlight.setAttribute("y2", 52.5);
  highlight.setAttribute("stroke", "#17aaff77");
  highlight.setAttribute("stroke-width", 20);
  svg.insertBefore(highlight, title);

  if (event.media) {
    const overlay = document.createElement("div");
    overlay.className = "imageOverlay";
    overlay.style.display = "none";
    overlay.addEventListener("click", () => {
      iframe.style.display = "none";
      overlay.style.display = "none";
    });
    document.body.appendChild(overlay);

    const iframe = document.createElement("iframe");
    iframe.width = "50";
    iframe.height = "50";
    iframe.src = event.media;
    iframe.style.display = "none";
    iframe.className = "thoughtBubble";
    document.body.appendChild(iframe);

    const imgBtn = document.createElementNS(svgNS, "g");
    imgBtn.style.cursor = "pointer";
    imgBtn.addEventListener("click", () => {
      if (iframe.style.display === "none") {
        iframe.style.display = "block";
        overlay.style.display = "block";
      } else {
        iframe.style.display = "none";
        overlay.style.display = "none";
      }
    });
    svg.appendChild(imgBtn);

    const clipImg = document.createElementNS(svgNS, "image");
    clipImg.setAttribute("href", "./images/img.png");
    clipImg.setAttribute("x", screenWidth - 200);
    clipImg.setAttribute("y", 86);
    clipImg.setAttribute("class", "img");
    clipImg.style.filter = "drop-shadow(3px 3px 3px rgba(66, 71, 85, 0.67))";
    imgBtn.appendChild(clipImg);
  }
}

/* wrapText and fitTextToLines: ebb: These next functions help out
the buildCard function, to allow wrapping
long text in descriptions. */
// Wraps text into <tspan> lines that fit within maxWidth.
// The element must already be in the DOM, because measuring needs rendered text.
function wrapText(textEl, text, maxWidth, lineHeight = 25) {
  const svgNS = "http://www.w3.org/2000/svg";
  const x = textEl.getAttribute("x");
  const words = text.split(/\s+/); // also collapses newlines and indentation from the XML
  textEl.textContent = "";

  const newLine = (dy) => {
    const tspan = document.createElementNS(svgNS, "tspan");
    tspan.setAttribute("x", x); // each line restarts at the left margin
    tspan.setAttribute("dy", dy); // and moves down one line
    textEl.appendChild(tspan);
    return tspan;
  };

  let tspan = newLine(0);
  let line = "";
  let lineCount = 1;

  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    tspan.textContent = test;
    if (tspan.getComputedTextLength() > maxWidth && line) {
      tspan.textContent = line; // keep the previous line without the overflowing word
      tspan = newLine(lineHeight);
      tspan.textContent = word;
      line = word;
      lineCount += 1;
    } else {
      line = test;
    }
  });
  return lineCount;
}
// fitTextToLines: Shrinks the font one pixel at a time until the text fits in maxLines.
// Starts from whatever size our CSS gives the element.
function fitTextToLines(
  textEl,
  text,
  maxWidth,
  maxLines = 3,
  minSize = 8,
  lineHeight = 25,
) {
  let size = parseFloat(getComputedStyle(textEl).fontSize);
  textEl.style.fontSize = `${size}px`;
  let lines = wrapText(textEl, text, maxWidth, lineHeight);

  while (lines > maxLines && size > minSize) {
    size -= 1;
    textEl.style.fontSize = `${size}px`;
    lines = wrapText(textEl, text, maxWidth, lineHeight);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// buildFixedPanel()
// Draws the fixed left panel — track labels, horizontal lines, vertical
// divider — into #timeline-fixed. This element does NOT scroll, so these
// elements stay in place while the ruler scrolls behind them.
// y positions must match the span rectangles in buildTimelineSVG().
// ---------------------------------------------------------------------------
function buildFixedPanel(events, svgHeight) {
  const svgNS = "http://www.w3.org/2000/svg";
  const panelWidth = 200;
  const fixed = document.getElementById("timeline-fixed");
  fixed.setAttribute("viewBox", `0 0 ${panelWidth} ${svgHeight}`);
  fixed.setAttribute("width", panelWidth);
  fixed.setAttribute("height", svgHeight);

  const lineYs = [-10, 15, 40, 65, 90, 115, 140, 165, 190, 215, 240, 265];
  lineYs.forEach((y) => {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", 0);
    line.setAttribute("y1", y);
    line.setAttribute("x2", panelWidth);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "#173aff");
    line.setAttribute("stroke-width", 3);
    fixed.appendChild(line);
  });

  const vline = document.createElementNS(svgNS, "line");
  vline.setAttribute("x1", 30);
  vline.setAttribute("y1", -10);
  vline.setAttribute("x2", 30);
  vline.setAttribute("y2", 1000);
  vline.setAttribute("stroke", "#ff0000");
  vline.setAttribute("stroke-width", 6);
  fixed.appendChild(vline);

  const trackY = { 1: 62, 2: 136, 3: 211 };
  const seen = new Set();
  events.forEach((event) => {
    if (seen.has(event.track)) return;
    seen.add(event.track);
    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", 40);
    label.setAttribute("y", trackY[event.track]);
    label.setAttribute("fill", "#ff0000");
    label.setAttribute("font-size", 30);
    label.setAttribute("style", "font-weight: 700;");
    label.setAttribute("style", 'font-family: "BrownCookies";');
    label.textContent = event.name;
    fixed.appendChild(label);
    const highlightL = document.createElementNS(svgNS, "line");
    highlightL.setAttribute("x1", 35);
    highlightL.setAttribute("y1", trackY[event.track] - 10);
    highlightL.setAttribute("x2", panelWidth);
    highlightL.setAttribute("y2", trackY[event.track] - 10);
    highlightL.setAttribute("stroke", "#ff910091");
    highlightL.setAttribute("stroke-width", 25);
    fixed.insertBefore(highlightL, label);
  });
}

// ---------------------------------------------------------------------------
// buildTimelineSVG()
// Generates the proportional SVG timeline ruler from event data.
// Replicates the XSLT logic from timeline.xsl:
//   - x-spacer of 10 units per year
//   - tick marks every 5 / 10 / 50 / 100 years
//   - span rectangles from start to end date for each event
//   - group translated so negative (BC) coordinates are visible
// The fixed left panel (labels, lines) lives in buildFixedPanel() and
// does not scroll. Only the ruler content lives here.
// ---------------------------------------------------------------------------
function buildTimelineSVG(events, onSelect, { minYear, maxYear }) {
  const xSpacer = 10;
  const svgHeight = 288;
  const rulerY = 10;
  const rulerHeight = 220;

  // Ruler positions (gapless: no year 0). Data and labels stay in signed years.
  const earliestPos = toPos(minYear);
  const latestPos = toPos(maxYear);

  const padding = 100;
  const rulerWidth = (latestPos - earliestPos) * xSpacer + padding * 2;
  const translateX = -earliestPos * xSpacer + 140;
  const svgWidth = rulerWidth + translateX;
  /* ebb: If the ruler width has too much space on the right, change
  this to:
  const svgWidth = rulerWidth + 80 */

  const svgNS = "http://www.w3.org/2000/svg";

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", svgWidth);
  svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
  svg.style.display = "block";

  const g = document.createElementNS(svgNS, "g");
  const translateY = 10;
  g.setAttribute("transform", `translate(${translateX}, ${translateY})`);

  const lineYs = [-10, 15, 40, 65, 90, 115, 140, 165, 190, 215, 240, 265];
  lineYs.forEach((y) => {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", -70000);
    line.setAttribute("y1", y);
    line.setAttribute("x2", svgWidth);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "#173aff");
    line.setAttribute("stroke-width", 3);
    g.appendChild(line);
  });

  // Background rectangle
  const rect = document.createElementNS(svgNS, "rect");
  rect.setAttribute("width", rulerWidth);
  rect.setAttribute("height", rulerHeight);
  rect.setAttribute("x", earliestPos * xSpacer - padding);
  rect.setAttribute("y", rulerY);
  rect.setAttribute("rx", 20);
  rect.setAttribute("ry", 20);
  rect.setAttribute("fill", "#6cebba9d");
  rect.setAttribute("stroke", "#4f9987");
  rect.setAttribute("stroke-width", "3");
  rect.style.filter = "drop-shadow(3px 3px 5px rgba(2, 29, 102, 0.45))";
  g.appendChild(rect);

  // Tick marks — every 5 / 10 / 50 / 100 years
  for (let year = Math.floor(minYear); year <= Math.ceil(maxYear); year += 1) {
    if (year === 0) continue;
    const x = toPos(year) * xSpacer;
    const isCentury = year % 100 === 0;
    const isHalfCentury = year % 50 === 0;
    const isDecade = year % 10 === 0;
    const isHalfDecade = year % 5 === 0;
    if (isCentury) {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", x);
      line.setAttribute("y1", rulerY);
      line.setAttribute("x2", x);
      line.setAttribute("y2", rulerY + 190);
      line.setAttribute("stroke", "white");
      line.setAttribute("stroke-width", 10);
      line.style.filter = "drop-shadow(3px 3px 5px rgba(2, 102, 47, 0.25))";
      g.appendChild(line);
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", x);
      text.setAttribute("y", rulerY + 210);
      text.setAttribute("fill", "#ffffff");
      text.setAttribute("font-size", 18);
      text.setAttribute("style", "font-weight: 900;");
      text.setAttribute("text-anchor", "middle");
      text.textContent = year;
      g.appendChild(text);
    } else if (isHalfCentury) {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", x);
      line.setAttribute("y1", rulerY);
      line.setAttribute("x2", x);
      line.setAttribute("y2", rulerY + 140);
      line.setAttribute("stroke", "white");
      line.setAttribute("stroke-width", 5);
      line.style.filter = "drop-shadow(3px 3px 5px rgba(2, 102, 47, 0.25))";
      g.appendChild(line);
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", x);
      text.setAttribute("y", rulerY + 157);
      text.setAttribute("fill", "#ffffff");
      text.setAttribute("font-size", 15);
      text.setAttribute("style", "font-weight: 700;");
      text.setAttribute("text-anchor", "middle");
      text.textContent = year;
      g.appendChild(text);
    } else if (isDecade) {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", x);
      line.setAttribute("y1", rulerY);
      line.setAttribute("x2", x);
      line.setAttribute("y2", rulerY + 90);
      line.setAttribute("stroke", "white");
      line.setAttribute("stroke-width", 3);
      line.style.filter = "drop-shadow(3px 3px 5px rgba(2, 102, 47, 0.25))";
      g.appendChild(line);
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", x);
      text.setAttribute("y", rulerY + 106);
      text.setAttribute("fill", "#ffffff");
      text.setAttribute("font-size", 13);
      text.setAttribute("style", "font-weight: 500;");
      text.setAttribute("text-anchor", "middle");
      text.textContent = year;
      g.appendChild(text);
    } else if (isHalfDecade) {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", x);
      line.setAttribute("y1", rulerY);
      line.setAttribute("x2", x);
      line.setAttribute("y2", rulerY + 50);
      line.setAttribute("stroke", "white");
      line.setAttribute("stroke-width", 2);
      line.style.filter = "drop-shadow(3px 3px 5px rgba(2, 102, 47, 0.25))";
      g.appendChild(line);
    } else {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", x);
      line.setAttribute("y1", rulerY);
      line.setAttribute("x2", x);
      line.setAttribute("y2", rulerY + 25);
      line.setAttribute("stroke", "white");
      line.setAttribute("stroke-width", 1);
      line.style.filter = "drop-shadow(3px 3px 5px rgba(2, 102, 47, 0.25))";
      g.appendChild(line);
    }
  }

  const hole = document.createElementNS(svgNS, "circle");
  hole.setAttribute("cx", earliestPos * xSpacer - 50);
  hole.setAttribute("cy", 120);
  hole.setAttribute("r", 20);
  hole.setAttribute("fill", "#ecece8");
  hole.setAttribute("stroke", "#5a8f82");
  hole.setAttribute("stroke-width", "3");
  hole.style.filter = "drop-shadow(3px 3px 5px #c3eee9af)";
  g.appendChild(hole);

  // Event span rectangles — drawn from start to end date
  // y positions must match the track label positions in buildFixedPanel()
  const trackY = { 1: 39, 2: 114, 3: 189 };
  events.forEach((event, index) => {
    const startX = toPos(event.signedYearStart) * xSpacer;
    const endX =
      event.signedYearEnd !== null
        ? toPos(event.signedYearEnd) * xSpacer
        : startX + 5;
    let spanWidth = endX - startX;
    if (spanWidth < 1) {
      spanWidth = 5;
      console.log("0 length");
    }
    const note = document.createElementNS(svgNS, "rect");
    note.setAttribute("width", spanWidth);
    note.setAttribute("height", 27);
    note.setAttribute("x", startX);
    note.setAttribute("y", trackY[event.track]);
    note.setAttribute("fill", "#e61edca1");
    note.setAttribute("class", "event-span");
    note.setAttribute("data-index", index);
    note.dataset.cx = startX;
    note.style.cursor = "pointer";
    note.addEventListener("click", () => onSelect(index));
    g.appendChild(note);
  });
  const trackY2 = { 1: 62, 2: 136, 3: 211 };
  const seen = new Set();
  events.forEach((event) => {
    if (seen.has(event.track)) return;
    seen.add(event.track);
    const highlightL = document.createElementNS(svgNS, "line");
    highlightL.setAttribute("x1", -70000);
    highlightL.setAttribute("y1", trackY2[event.track] - 10);
    highlightL.setAttribute("x2", svgWidth);
    highlightL.setAttribute("y2", trackY2[event.track] - 10);
    highlightL.setAttribute("stroke", "#ff910091");
    highlightL.setAttribute("stroke-width", 25);
    g.insertBefore(highlightL, rect);
  });

  svg.appendChild(g);
  return { svg, translateX, xSpacer };
}
let currentIndex = 0;

// ---------------------------------------------------------------------------
// selectEvent()
// Central selection handler — called by map markers, timeline spans, cards.
// Updates the card panel, pans the map, and scrolls the timeline ruler.
// ---------------------------------------------------------------------------
function selectEvent(index, events, map, svgInfo, onSelect) {
  currentIndex = index;
  const event = events[index];

  buildCard(event, index, events, onSelect);
  map.setView([event.lat, event.lon], 14);

  // Reset all spans to default colour
  document.querySelectorAll(".event-span").forEach((span) => {
    span.setAttribute("fill", "#e61edca1");
    span.setAttribute("stroke", "#96008ea1");
  });

  // Highlight active span
  const activeSpan = document.querySelector(
    `.event-span[data-index="${index}"]`,
  );
  if (activeSpan) {
    activeSpan.setAttribute("fill", "#96008ea1");
    activeSpan.setAttribute("stroke", "#70006ba1");

    // Scroll timeline ruler so active span is centred
    const spanCX = parseFloat(activeSpan.dataset.cx);
    const scrollTarget = spanCX + svgInfo.translateX - window.innerWidth / 2;
    document.getElementById("timeline-ruler").scrollLeft = scrollTarget;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const events = await parseEvents();
events.sort((a, b) => a.signedYearStart - b.signedYearStart);
const { minYear, maxYear } = getYearRange(events);

const onSelect = (index) => selectEvent(index, events, map, svgInfo, onSelect);

const map = buildMap(events, onSelect);

// Build fixed left panel (does not scroll)
buildFixedPanel(events, 260);

// Build scrollable ruler
const { svg, translateX, xSpacer } = buildTimelineSVG(events, onSelect, {
  minYear,
  maxYear,
});
const svgInfo = { translateX, xSpacer };
document.getElementById("timeline-ruler").appendChild(svg);

// Show the first event's card on load
selectEvent(0, events, map, svgInfo, onSelect);

// ebb: Listen for window resizing when we have long text in descriptions:
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer); // wait until resizing pauses
  resizeTimer = setTimeout(() => {
    buildCard(events[currentIndex], currentIndex, events, onSelect);
  }, 150);
});
