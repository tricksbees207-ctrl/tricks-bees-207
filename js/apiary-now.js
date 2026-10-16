// Edit this one object whenever the seasonal apiary update changes.
const apiaryNowData = {
  eyebrow: "MID-OCTOBER IN MAINE",
  updated: "October 12, 2026",
  intro: "Coastal Maine honey bee colonies are preparing for winter. Brood rearing is generally declining, dependable nectar sources are fading, and colonies are increasingly relying on stored food. Weather and the timing of the first hard frosts affect how quickly this transition occurs.",
  cards: [
    { icon: "🐝", title: "Winter cluster preparation", text: "Colonies are shifting toward winter survival. Brood nests typically shrink, and healthy winter bees become increasingly important as temperatures fall." },
    { icon: "🍯", title: "Check winter food reserves", text: "Stored honey and overall hive weight are especially important now. Colonies need adequate accessible food to survive the long Maine winter." },
    { icon: "🔬", title: "Varroa and colony health", text: "Varroa control remains critical to winter survival. Review mite monitoring and treatment history, and follow product labels and temperature requirements for any remaining treatments." },
    { icon: "🍂", title: "The final fall forage", text: "Asters and goldenrod may still offer nectar or pollen during mild periods, but frost and shorter days are bringing the main forage season to a close." }
  ],
  watching: ["Hive weight", "Winter food reserves", "Varroa management", "Brood reduction", "Fall forage and frost"]
};

// Keep the dated apiary report and the automatically selected monthly guide separate.
// A dated report appears as current only during the month it was written for.
(function renderApiaryNow() {
  const $ = id => document.getElementById(id);
  const cards = items => items.map(item =>
    '<article class="season-card"><span>' + item.icon +
    '</span><h3>' + item.title + '</h3><p>' + item.text + '</p></article>'
  ).join("");
  const tasks = items => cards(items.map(task => ({
    icon: task[0], title: task[1], text: task[2]
  })));
  const pills = (label, items) =>
    "<strong>" + label + "</strong>" +
    items.map(item => "<span>" + item + "</span>").join("");

  function updateSeasonalContent() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", year: "numeric", month: "numeric"
    }).formatToParts(new Date());
    const month = Number(parts.find(part => part.type === "month").value);
    const year = Number(parts.find(part => part.type === "year").value);
    const guide = apiaryMonthlyTasks[month - 1];
    if (!guide) return;

    const editorialIsCurrent = year === 2026 && month === 10;
    const extra = $("apiary-monthly-guide");

    if (editorialIsCurrent) {
      const d = apiaryNowData;
      $("apiary-now-eyebrow").textContent = d.eyebrow;
      $("apiary-now-intro").textContent = d.intro;
      $("apiary-now-updated").textContent = "Last updated: " + d.updated;
      $("apiary-now-cards").innerHTML = cards(d.cards);
      $("apiary-now-watch").innerHTML = pills("What we're watching:", d.watching);

      $("apiary-monthly-title").textContent = guide.month + " hive management checklist";
      $("apiary-monthly-intro").textContent =
        "General tasks for " + guide.month +
        " in coastal Maine. Adapt them to weather and actual hive conditions.";
      $("apiary-monthly-cards").innerHTML = tasks(guide.tasks);
      extra.hidden = false;
    } else {
      // After the dated report's month has passed, display evergreen monthly guidance
      // as the main section rather than presenting an old report as current.
      $("apiary-now-eyebrow").textContent = guide.month.toUpperCase() + " IN COASTAL MAINE";
      $("apiary-now-intro").textContent =
        "Recommended beekeeping tasks for " + guide.month +
        " in coastal Maine. Adjust these recommendations to weather and actual hive conditions.";
      $("apiary-now-updated").textContent =
        "Seasonal guide: " + guide.month + " | Guidance last reviewed: October 12, 2026";
      $("apiary-now-cards").innerHTML = tasks(guide.tasks);
      $("apiary-now-watch").innerHTML =
        pills("Monthly priorities:", guide.tasks.map(task => task[1]));
      extra.hidden = true;
    }
  }

  updateSeasonalContent();
  setInterval(updateSeasonalContent, 60 * 60 * 1000);
})();
