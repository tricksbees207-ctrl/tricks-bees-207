// Edit this one object whenever the seasonal apiary update changes.
const apiaryNowData = {
  eyebrow: "LATE SEPTEMBER IN MAINE",
  updated: "September 29, 2026",
  intro: "The apiary is shifting from summer production toward winter survival. Colonies are tightening their brood nests, protecting stores, and making the most of the final dependable forage before cold weather settles in.",
  cards: [
    { icon: "🐝", title: "Winter bees are taking over", text: "Brood production is contracting and the long-lived workers that carry the colony through winter are increasingly important." },
    { icon: "🍯", title: "Stores matter now", text: "Colonies need substantial food reserves for a Maine winter. Hive weight and stored honey become especially useful things to watch as the season closes." },
    { icon: "🔬", title: "Varroa pressure matters", text: "Late-season colony health has an outsized effect on winter survival. Mite monitoring and properly timed management remain important as winter bees develop." },
    { icon: "🚪", title: "Guarding gets serious", text: "As forage declines, robbing pressure and yellowjacket activity can become more noticeable around weaker colonies." }
  ],
  watching: ["Hive weight", "Food stores", "Varroa levels", "Brood contraction", "Entrance activity"]
};

(function renderApiaryNow() {
  const d = apiaryNowData;
  document.getElementById("apiary-now-eyebrow").textContent = d.eyebrow;
  document.getElementById("apiary-now-intro").textContent = d.intro;
  document.getElementById("apiary-now-updated").textContent = `Last updated: ${d.updated}`;
  document.getElementById("apiary-now-cards").innerHTML = d.cards.map(card =>
    `<article class="season-card"><span>${card.icon}</span><h3>${card.title}</h3><p>${card.text}</p></article>`
  ).join("");
  document.getElementById("apiary-now-watch").innerHTML =
    `<strong>What we're watching:</strong>` + d.watching.map(item => `<span>${item}</span>`).join("");
})();
