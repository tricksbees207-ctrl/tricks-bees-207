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
